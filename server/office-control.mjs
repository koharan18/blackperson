import net from 'node:net';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,unlinkSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

export async function startOfficeControl(directory,onStop) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const id=createHash('sha256').update(resolve(directory).toLowerCase()).digest('hex').slice(0,20);
  const endpoint=process.platform==='win32'?`\\\\.\\pipe\\BLACK-${id}`:join(tmpdir(),`black-office-${id}.sock`);
  const path=join(directory,'office-control.json'),token=randomBytes(32).toString('hex');
  let stopRequested=false,closed;
  const server=net.createServer(socket=>{
    socket.setTimeout(3000,()=>socket.destroy());let input='';
    socket.on('error',()=>{});
    socket.on('data',data=>{
      input+=data.toString('utf8');if(input.length>4096){socket.destroy();return;}
      if(!input.includes('\n'))return;
      let request;try{request=JSON.parse(input.split('\n')[0]);}catch{socket.end('{"ok":false}\n');return;}
      if(!request||typeof request!=='object'||Array.isArray(request)){socket.end('{"ok":false}\n');return;}
      const supplied=typeof request.token==='string'?Buffer.from(request.token):Buffer.alloc(0),expected=Buffer.from(token);
      if(request.command!=='stop'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){socket.end('{"ok":false}\n');return;}
      if(stopRequested){socket.end('{"ok":true}\n');return;}
      stopRequested=true;
      socket.end('{"ok":true}\n',()=>{Promise.resolve().then(onStop).catch(()=>{});});
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});
  server.on('error',()=>{});
  try{
    if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw new Error('제어 파일 경로를 확인해 주세요.');
    writeFileSync(path,JSON.stringify({endpoint,token,pid:process.pid}),{mode:0o600});
  }catch(error){await new Promise(r=>server.close(r));throw error;}
  return {path,close(){return closed||=(async()=>{await new Promise(r=>server.close(r));try{if(JSON.parse(readFileSync(path)).token===token)unlinkSync(path);}catch{}})();}};
}

export function requestOfficeStop(metadata) {
  return new Promise((resolve,reject)=>{
    if(!metadata||typeof metadata.endpoint!=='string'||typeof metadata.token!=='string'){reject(new Error('서버 제어 정보를 읽을 수 없습니다.'));return;}
    const socket=net.createConnection(metadata.endpoint);let response='';
    socket.setTimeout(5000,()=>socket.destroy(new Error('서버 종료 요청 시간이 초과되었습니다.')));
    socket.on('connect',()=>socket.write(JSON.stringify({command:'stop',token:metadata.token})+'\n'));
    socket.on('data',data=>{response+=data.toString();if(response.length>4096)socket.destroy(new Error('제어 응답이 올바르지 않습니다.'));});
    socket.on('error',()=>reject(new Error('서버 제어 연결을 사용할 수 없습니다.')));
    socket.on('end',()=>{try{if(JSON.parse(response).ok)resolve();else reject(new Error('종료 요청이 거부되었습니다.'));}catch{reject(new Error('서버 제어 응답을 읽을 수 없습니다.'));}});
  });
}
