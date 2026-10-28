import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
function canonical(value){
 if(value===null||typeof value!=='object')return value;
 if(value instanceof Date)return value.toISOString();
 if(Buffer.isBuffer(value))return value.toString('base64');
 if(Array.isArray(value))return value.map(canonical);
 return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
}
let db,client,result,exit=0;
try{
 const root=resolve(process.argv[2]||'');
 if(!process.argv[2]||!existsSync(join(root,'data/postgres/PG_VERSION'))||!existsSync(join(root,'data/runtime.json')))throw new Error('EXISTING_DATABASE_REQUIRED');
 const {startDatabase,readConfig}=await import(pathToFileURL(join(root,'server/runtime.mjs')));
 const {decryptPhone}=await import(pathToFileURL(join(root,'server/domain.mjs')));
 const config=readConfig();if(!config.PHONE_ENCRYPTION_KEY)throw new Error('ORIGINAL_KEY_REQUIRED');
 db=await startDatabase({directory:join(root,'data'),port:Number(process.argv[3]||15434)});
 client=await db.pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 for(const row of (await client.query('SELECT phone FROM "RestrictedPerson"')).rows)decryptPhone(row.phone,config.PHONE_ENCRYPTION_KEY);
 const names=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'RecoverySession' ORDER BY table_name")).rows;
 const tables={};
 for(const {table_name:name} of names){
  const rows=(await client.query('SELECT * FROM "'+name.replaceAll('"','""')+'"')).rows.map(row=>JSON.stringify(canonical(row))).sort();
  tables[name]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }
 await client.query('COMMIT');result={format:'BLACK-MOVE-CHECK-1',tables,sha256:createHash('sha256').update(JSON.stringify(tables)).digest('hex')};
}catch(error){exit=1;console.error('이전 검증 실패:',error.code||'MIGRATION_VERIFY_FAILED');}
finally{if(client)client.release();if(db)try{await db.stop();}catch{exit=1;console.error('이전 검증 DB 정상 종료 실패');}}
if(exit===0)console.log(JSON.stringify(result));
process.exit(exit);
