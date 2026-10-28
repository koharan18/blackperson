import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';

export const officeStaff=Object.freeze([
  {name:'햄맨',email:'hamman@black.local'},
  {name:'루피',email:'loopy@black.local'},
  {name:'조이',email:'joy@black.local'},
  {name:'동동',email:'dongdong@black.local'},
  {name:'체리',email:'cherry@black.local'},
]);

export async function setupOfficeAccounts(pool,password) {
  if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('공통 비밀번호는 12~128자로 입력해 주세요.');
  const client=await pool.connect();const result={created:0,updated:0};
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(823403)');
    await client.query('CREATE TABLE IF NOT EXISTS "RecoveryAccountState" ("userId" text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,disabled boolean NOT NULL DEFAULT false)');
    const sessions=(await client.query("SELECT to_regclass('public.\"RecoverySession\"') present")).rows[0].present;
    for(const staff of officeStaff){
      const existing=await client.query('SELECT id,role FROM "User" WHERE lower(email)=lower($1) FOR UPDATE',[staff.email]);
      if(existing.rowCount>1)throw new Error('대소문자만 다른 중복 계정이 있어 자동 설정을 중단했습니다.');
      const id=existing.rows[0]?.id||randomUUID();
      const hash=await bcrypt.hash(password,12);
      if(existing.rowCount){
        await client.query('UPDATE "User" SET name=$2,"passwordHash"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1',[id,staff.name,hash]);result.updated++;
      }else{
        await client.query('INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,\'USER\',CURRENT_TIMESTAMP)',[id,staff.name,staff.email,hash]);result.created++;
      }
      await client.query('INSERT INTO "RecoveryAccountState" ("userId",disabled) VALUES ($1,false) ON CONFLICT ("userId") DO UPDATE SET disabled=false',[id]);
      if(sessions)await client.query('DELETE FROM "RecoverySession" WHERE sess->>\'userId\'=$1',[id]);
      await client.query('INSERT INTO "AuditLog" (id,action,"targetType","targetId","afterData") VALUES ($1,\'OFFICE_ACCOUNT_SETUP\',\'User\',$2,$3)',[randomUUID(),id,JSON.stringify({name:staff.name,email:staff.email,role:existing.rows[0]?.role||'USER',passwordReset:true})]);
    }
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
