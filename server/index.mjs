import { startDatabase, readConfig } from './runtime.mjs';
import { createApp } from './app.mjs';
import { decryptPhone } from './domain.mjs';
import { createListener } from './listener.mjs';
import { startOfficeControl } from './office-control.mjs';
import { join } from 'node:path';
import { root } from './runtime.mjs';

let db,server,app,control,stopping;
const stop=()=>stopping||=(async()=>{if(control)await control.close();if(server) await new Promise(r=>server.close(r));if(app) await app.locals.closeSessionStore();if(db) await db.stop();})();
try {
  const config=readConfig();
  db=await startDatabase();
  const {rows}=await db.pool.query('SELECT phone FROM "RestrictedPerson"');
  for(const row of rows) decryptPhone(row.phone,config.PHONE_ENCRYPTION_KEY);
  app=await createApp({pool:db.pool,config});
  const port=Number(config.BLACK_PORT)||8234,host=config.BLACK_BIND_HOST||'127.0.0.1';
  server=createListener(app,config);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
  if(config.BLACK_OFFICE_MODE==='true')control=await startOfficeControl(join(root,'private'),async()=>{await stop();process.exit(0);});
  console.log(`BLACK 서버 실행: ${host}:${port} (대상자 ${rows.length}건 복호화 확인)`);
  server.on('error',async()=>{console.error('서버 포트를 사용할 수 없습니다. 다른 BLACK 실행 창을 확인해 주세요.');await stop();process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await stop();process.exit(0);});
} catch(e) {console.error(e.code==='42P01'?'아직 복원되지 않았습니다. 먼저 npm run restore를 실행해 주세요.':e.message);await stop();process.exitCode=1;}
