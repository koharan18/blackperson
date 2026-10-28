import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {windowsDirectoryAlias} from './windows-paths.mjs';
const run=promisify(execFile);

export async function windowsPgCtlPath(){
  const {pg_ctl:path}=await import('@embedded-postgres/windows-x64');
  if(!existsSync(path))throw new Error('PostgreSQL 관리 프로그램(pg_ctl.exe)을 찾을 수 없습니다. DB 파일은 삭제하지 마세요.');
  return path;
}

// On Windows pg_ctl uses PostgreSQL's own CreateRestrictedProcess, removing
// administrator groups/privileges before launching the postmaster. Never launch
// postgres.exe directly from the administrative installer.
export async function startControlledPostgres({executable,directory,port,logFile=join(directory,'black-postgres.log')}){
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid database port');
  if(process.platform==='win32'){
    const nativeRoot=dirname(dirname(executable));
    executable=join(windowsDirectoryAlias(nativeRoot),'bin',basename(executable));
    directory=windowsDirectoryAlias(directory);
    logFile=join(windowsDirectoryAlias(dirname(logFile)),basename(logFile));
  }
  try{
    await run(executable,['start','-D',directory,'-l',logFile,'-w','-t','30','-o',`-h 127.0.0.1 -p ${port}`],{windowsHide:true,timeout:40000,maxBuffer:65536});
  }catch(error){
    let detail='';try{detail=readFileSync(logFile,'utf8').slice(-4000);}catch{}
    throw new Error('로컬 PostgreSQL 시작 실패: '+(detail||error.stderr||error.code||'PG_CTL_START_FAILED'));
  }
  let stopped;
  return {stop(){return stopped||=(async()=>{
    try{await run(executable,['stop','-D',directory,'-m','fast','-w','-t','30'],{windowsHide:true,timeout:40000,maxBuffer:65536});}
    catch(error){throw new Error('로컬 PostgreSQL 정상 종료 실패: '+(error.stderr||error.code||'PG_CTL_STOP_FAILED'));}
  })();}};
}
