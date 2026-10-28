import {readFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requestOfficeStop} from '../server/office-control.mjs';
const path=join(resolve(dirname(fileURLToPath(import.meta.url)),'..'),'private','office-control.json');
try{
  if(!existsSync(path)){console.log('자동 운영 서버 제어 파일이 없습니다. 일반 실행 창이라면 Ctrl+C로 종료하세요.');process.exitCode=2;}
  else{await requestOfficeStop(JSON.parse(readFileSync(path,'utf8')));console.log('서버에 정상 종료를 요청했습니다.');}
}catch{console.error('자동 운영 서버에 연결할 수 없습니다. 작업 스케줄러와 실행 상태를 확인해 주세요.');process.exitCode=1;}
