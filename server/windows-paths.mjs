import {execFileSync} from 'node:child_process';
import {realpathSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const cache=new Map();
export function canonicalDirectory(path){
 const value=realpathSync.native(path);
 return process.platform==='win32'?value.toLowerCase():value;
}
// Query the existing NTFS short name. No copies, junctions, volume settings or
// filesystem names are created/changed. PostgreSQL receives an ASCII alias.
export function windowsDirectoryAlias(directory){
 if(process.platform!=='win32'||!/[\u0080-\uffff]/.test(directory))return directory;
 const target=realpathSync.native(directory);
 if(!statSync(target).isDirectory())throw new Error('Native path must be a directory');
 if(cache.has(target))return cache.get(target);
 const script=`[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
$path=[Console]::In.ReadToEnd()
Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class BlackShortPath { [DllImport("kernel32.dll",EntryPoint="GetShortPathNameW",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] public static extern uint Get(string path,StringBuilder result,uint size); }'
$buffer=New-Object Text.StringBuilder 32768
$length=[BlackShortPath]::Get($path,$buffer,32768)
if($length -eq 0 -or $length -ge 32768){exit 1}
[Console]::Out.Write($buffer.ToString())`;
 const alias=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:target,encoding:'utf8',windowsHide:true,timeout:15000}).trim();
 if(!alias||/[\u0080-\uffff]/.test(alias)||canonicalDirectory(alias)!==canonicalDirectory(target))throw new Error('이 폴더의 영문 NTFS 경로 별칭을 확인할 수 없습니다. 원본 앱은 보존합니다.');
 cache.set(target,alias);return alias;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url&&process.argv[2]==='--probe'){
 try{console.log(JSON.stringify(process.argv.slice(3).map(windowsDirectoryAlias)));}catch{console.error('Windows 한글 경로 별칭 확인 실패');process.exitCode=1;}
}
