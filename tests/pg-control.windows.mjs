import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startDatabase} from '../server/runtime.mjs';
import {windowsPgCtlPath,startControlledPostgres} from '../server/pg-control.mjs';
import {windowsDirectoryAlias} from '../server/windows-paths.mjs';
const run=promisify(execFile);
let db,folder,control,nativeClient,aliases,exit=0;const progress=[];let failure='';
try{
 assert.equal(process.platform,'win32');
 const admin=execFileSync('powershell.exe',['-NoProfile','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{encoding:'utf8'}).trim();
 assert.equal(admin,'True','test must exercise elevated Node');
 console.log('Elevated orchestrator confirmed.');progress.push('elevated');
 folder=mkdtempSync(join(tmpdir(),'black-pg-코덱스-'));
 const sid=execFileSync('powershell.exe',['-NoProfile','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8'}).trim();
 execFileSync('icacls.exe',[folder,'/grant:r',`*${sid}:(OI)(CI)F`]);
 aliases=mkdtempSync(join(tmpdir(),'black-native-alias-'));process.env.BLACK_NATIVE_ALIAS_ROOT=aliases;
 const directory=join(folder,'data');mkdirSync(directory);
 const cluster=join(directory,'postgres'),password=randomBytes(32).toString('hex');
 writeFileSync(join(directory,'runtime.json'),JSON.stringify({password}));
 const pwfile=join(folder,'init-password.txt');writeFileSync(pwfile,password+'\n');
 const originalExecutable=await windowsPgCtlPath();
 const nativeRoot=join(folder,'native');cpSync(dirname(dirname(originalExecutable)),nativeRoot,{recursive:true});
 const executable=join(windowsDirectoryAlias(nativeRoot),'bin','pg_ctl.exe');
 const initdb=join(windowsDirectoryAlias(nativeRoot),'bin','initdb.exe');
 const log=join(folder,'init.log');
 const launcher=join(folder,'init-launcher');mkdirSync(launcher);writeFileSync(join(launcher,'PG_VERSION'),'18\n');
 // Fixture only: a separate launcher directory lets pg_ctl apply its
 // restricted launcher to initdb too. Production never reinitializes a cluster.
 mkdirSync(cluster);
 const fixtureAlias=windowsDirectoryAlias(folder);
 await run(executable,['start','-D',windowsDirectoryAlias(launcher),'-p',initdb,'-o',`-D "${windowsDirectoryAlias(cluster)}" -U black_local --auth=scram-sha-256 --pwfile="${join(fixtureAlias,'init-password.txt')}" --encoding=UTF8 --locale=C`,'-l',join(fixtureAlias,'init.log'),'-W'],{windowsHide:true,timeout:15000});
 let initialized=false;
 for(let i=0;i<200;i++){
  if(existsSync(log)&&readFileSync(log,'utf8').includes('Success.')){initialized=true;break;}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(initialized,'restricted fixture initdb must finish: '+(existsSync(log)?readFileSync(log,'utf8'):'no log'));
 console.log('Restricted fixture initialization passed.');progress.push('initialized');
 db=await startDatabase({directory,port:15443});
 assert.equal((await db.pool.query('SELECT current_user AS name')).rows[0].name,'black_local');
 await db.pool.query('CREATE TABLE native_control_probe (id integer PRIMARY KEY)');
 await db.pool.query('INSERT INTO native_control_probe VALUES (1)');
 const second=await startDatabase({directory,port:15443});assert.equal(second.reused,true);await second.stop();
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM native_control_probe')).rows[0].n,1);
 await db.stop();db=null;
 control=await startControlledPostgres({executable:join(nativeRoot,'bin','pg_ctl.exe'),directory:cluster,port:15443});
 db=await startDatabase({directory,port:15443});assert.equal(db.reused,true);
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM native_control_probe')).rows[0].n,1);
 await db.stop();db=null;await control.stop();control=null;
 assert.ok(!existsSync(join(cluster,'postmaster.pid')),'pg_ctl fast stop must complete');
 db=await startDatabase({directory,port:15443});
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM native_control_probe')).rows[0].n,1);
 await db.stop();db=null;
 console.log('PASS: elevated Windows Node -> restricted PostgreSQL, authenticated query, reuse, fast stop, persisted restart.');
}catch(error){exit=1;failure=error.stack||error.message;console.error(failure);}
finally{if(db)try{await db.stop();}catch{};if(control)try{await control.stop();}catch{};if(exit===0){if(aliases)rmSync(aliases,{recursive:true,force:true});if(folder)rmSync(folder,{recursive:true,force:true});}}
if(process.env.RUNNER_TEMP)writeFileSync(join(process.env.RUNNER_TEMP,'black-native-result.json'),JSON.stringify({exit,progress,failure},null,2));
process.exit(exit);
