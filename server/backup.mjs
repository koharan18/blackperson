import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import {exportData} from './recovery.mjs';
import {decryptPhone} from './domain.mjs';

export async function writeLogicalBackup({pool,config,keyFile,outputRoot,settingsFile}) {
  if(!config.PHONE_ENCRYPTION_KEY||!existsSync(keyFile))throw new Error('백업에 필요한 원본 키 파일이 없습니다.');
  const saved=dotenv.parse(readFileSync(keyFile,'utf8').replace(/^\uFEFF/,''));
  if(saved.PHONE_ENCRYPTION_KEY!==config.PHONE_ENCRYPTION_KEY)throw new Error('현재 암호화 키와 백업할 키 파일이 다릅니다. 설정을 확인해 주세요.');
  for(const row of (await pool.query('SELECT phone FROM "RestrictedPerson"')).rows)decryptPhone(row.phone,config.PHONE_ENCRYPTION_KEY);
  const data=await exportData(pool,config.PHONE_ENCRYPTION_KEY);
  mkdirSync(outputRoot,{recursive:true,mode:0o700});
  const folder=mkdtempSync(join(outputRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-'));
  try{
    writeFileSync(join(folder,'black.black'),data,{mode:0o600});
    copyFileSync(keyFile,join(folder,'BLACK.env.backup'));
    if(settingsFile&&existsSync(settingsFile))copyFileSync(settingsFile,join(folder,'settings.env'));
    writeFileSync(join(folder,'manifest.json'),JSON.stringify({sha256:createHash('sha256').update(data).digest('hex'),format:'BLACK-ENCRYPTED-1',createdAt:new Date().toISOString()},null,2),{mode:0o600});
    return folder;
  }catch(error){rmSync(folder,{recursive:true,force:true});throw error;}
}
