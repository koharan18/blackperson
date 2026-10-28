import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,realpathSync,symlinkSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function canonicalDirectory(path){
 const value=realpathSync.native(path);
 return process.platform==='win32'?value.toLowerCase():value;
}

// pg_ctl is a narrow-character Windows program. An ASCII junction is just a
// directory alias: files stay in the user's selected folder, with the same ACLs.
export function windowsDirectoryAlias(directory){
 if(process.platform!=='win32'||!/[\u0080-\uffff]/.test(directory))return directory;
 const target=realpathSync.native(directory);
 if(!statSync(target).isDirectory())throw new Error('Native path must be a directory');
 const base=resolve(process.env.BLACK_NATIVE_ALIAS_ROOT||join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'BLACK-runtime-paths'));
 if(/[\u0080-\uffff]/.test(base))throw new Error('PostgreSQL 경로 별칭에는 영문 로컬 경로가 필요합니다.');
 if(existsSync(base)&&lstatSync(base).isSymbolicLink())throw new Error('Native alias root must not be a link');
 mkdirSync(base,{recursive:true,mode:0o700});
 const alias=join(base,createHash('sha256').update(target.toLowerCase()).digest('hex').slice(0,24));
 try{symlinkSync(target,alias,'junction');}catch(error){if(error.code!=='EEXIST')throw error;}
 if(!lstatSync(alias).isSymbolicLink()||canonicalDirectory(alias)!==canonicalDirectory(target))throw new Error('Native directory alias points to a different folder');
 return alias;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url&&process.argv[2]==='--probe'){
 try{console.log(JSON.stringify(process.argv.slice(3).map(windowsDirectoryAlias)));}catch{console.error('Windows 한글 경로 별칭 준비 실패');process.exitCode=1;}
}
