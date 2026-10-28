import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { join } from 'node:path';
import { root } from './runtime.mjs';
import { encryptPhone, decryptPhone, maskPhone, validatePerson, classifyApplicants } from './domain.mjs';

export class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
const publicUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role});
const equal = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cleanSnapshot = row => row ? Object.fromEntries(Object.entries(row).filter(([k])=>!['phone','passwordHash'].includes(k))) : null;
const applicantsSchema = z.object({ rows:z.array(z.object({name:z.string().trim().min(1).max(100),phone:z.string().max(40)})).min(1).max(2000) });
const accountSchema = z.object({ name:z.string().trim().min(1).max(100), email:z.email().max(200), password:z.string().min(12).max(128), role:z.enum(['ADMIN','USER']) });

export async function createApp({pool,config}) {
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length<24 || !config.PHONE_ENCRYPTION_KEY) throw new Error('원본 환경 백업의 SESSION_SECRET과 PHONE_ENCRYPTION_KEY가 필요합니다.');
  await pool.query(`CREATE TABLE IF NOT EXISTS "RecoveryAccountState" ("userId" text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE, disabled boolean NOT NULL DEFAULT false)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS "RecoverySession" (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL); CREATE INDEX IF NOT EXISTS recovery_session_expire ON "RecoverySession"(expire)`);
  await pool.query('DELETE FROM "RecoverySession" WHERE expire < CURRENT_TIMESTAMP');
  const boot=randomBytes(24).toString('hex');
  const ttl=Math.max(5,Math.min(1440,Number(config.SESSION_TTL_MINUTES)||60));
  const app=express();
  app.disable('x-powered-by');
  if(config.BLACK_TRUST_PROXY==='true') app.set('trust proxy','loopback');
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],upgradeInsecureRequests:null}}}));
  app.use(express.json({limit:'3mb'}));
  const PgSession=connectPg(session);
  const store=new PgSession({pool,tableName:'RecoverySession',pruneSessionInterval:60});
  app.locals.closeSessionStore=()=>store.close();
  app.use(session({name:'black.sid',secret:config.SESSION_SECRET,resave:false,saveUninitialized:false,store,
    cookie:{httpOnly:true,sameSite:'strict',secure:config.BLACK_HTTPS==='true',maxAge:ttl*60000}}));
  app.use('/api', (req,res,next)=>{
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if (!equal(req.headers['x-csrf-token'],req.session.csrf)) return next(new HttpError(403,'접속 정보가 만료되었습니다. 새로고침 후 다시 시도해 주세요.'));
      const origin=req.get('Origin');
      if(origin && origin!==`${req.protocol}://${req.get('host')}` && origin!==config.BLACK_PUBLIC_ORIGIN) return next(new HttpError(403,'허용되지 않은 요청 출처입니다.'));
    }
    next();
  });
  const audit=async(client,req,action,targetType,targetId,before=null,after=null)=>{
    await client.query('INSERT INTO "AuditLog" (id,"userId",action,"targetType","targetId","beforeData","afterData","ipAddress") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),req.user?.id||null,action,targetType,targetId,JSON.stringify(cleanSnapshot(before)),JSON.stringify(cleanSnapshot(after)),req.ip]);
  };
  const transaction=async fn=>{ const c=await pool.connect(); try {await c.query('BEGIN'); const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();} };
  const loadUser=async(req,res,next)=>{
    if (!req.session.userId) return next();
    if(config.SESSION_EXPIRE_ON_SERVER_RESTART==='true' && req.session.boot!==boot) {req.session.destroy(()=>{});return next();}
    const {rows}=await pool.query('SELECT u.*,coalesce(s.disabled,false) disabled FROM "User" u LEFT JOIN "RecoveryAccountState" s ON s."userId"=u.id WHERE u.id=$1',[req.session.userId]);
    if(rows[0] && !rows[0].disabled) req.user=rows[0];
    next();
  };
  app.use('/api',loadUser);
  app.get('/api/session',(req,res)=>{
    req.session.csrf ||= randomBytes(32).toString('hex');
    res.json({user:req.user?publicUser(req.user):null,csrfToken:req.session.csrf});
  });
  const loginLimit=rateLimit({windowMs:15*60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.'}});
  const dummyHash=await bcrypt.hash(randomBytes(24).toString('hex'),10);
  app.post('/api/login',loginLimit,async(req,res)=>{
    const {email,password}=z.object({email:z.string().trim().min(1).max(200),password:z.string().min(1).max(128)}).parse(req.body);
    const {rows}=await pool.query('SELECT u.*,coalesce(s.disabled,false) disabled FROM "User" u LEFT JOIN "RecoveryAccountState" s ON s."userId"=u.id WHERE lower(u.email)=lower($1)',[email]);
    const user=rows[0];
    const valid=await bcrypt.compare(password,user?.passwordHash||dummyHash);
    if(!valid||!user||user.disabled) throw new HttpError(401,'아이디 또는 비밀번호를 확인해 주세요.');
    await new Promise((r,j)=>req.session.regenerate(e=>e?j(e):r()));
    req.session.userId=user.id;req.session.boot=boot;req.session.csrf=randomBytes(32).toString('hex');req.user=user;
    await audit(pool,req,'LOGIN','User',user.id);
    await new Promise((r,j)=>req.session.save(e=>e?j(e):r()));
    res.json({user:publicUser(user),csrfToken:req.session.csrf});
  });
  app.use('/api',(req,res,next)=>req.user?next():next(new HttpError(401,'로그인이 필요합니다.')));
  const admin=(req,res,next)=>req.user.role==='ADMIN'?next():next(new HttpError(403,'관리자만 사용할 수 있습니다.'));
  app.post('/api/logout',async(req,res)=>{
    await audit(pool,req,'LOGOUT','User',req.user.id);
    await new Promise((r,j)=>req.session.destroy(e=>e?j(e):r()));
    res.clearCookie('black.sid');res.json({ok:true});
  });
  app.get('/api/dashboard',async(req,res)=>{
    const counts=(await pool.query(`SELECT count(*)::int total, count(*) FILTER(WHERE date_trunc('month',"registeredAt")=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'))::int AS "month", count(DISTINCT "programName")::int programs FROM "RestrictedPerson" WHERE "deletedAt" IS NULL`)).rows[0];
    const recent=(await pool.query('SELECT p.id,p.name,p."phoneMasked",p."programName",p.reason,p."registeredAt",u.name "registeredBy" FROM "RestrictedPerson" p JOIN "User" u ON u.id=p."registeredById" WHERE p."deletedAt" IS NULL ORDER BY p."createdAt" DESC LIMIT 8')).rows;
    res.json({...counts,recent});
  });
  const peopleWithPhones=async(client=pool)=>{
    const {rows}=await client.query('SELECT p.*,u.name "registeredBy" FROM "RestrictedPerson" p JOIN "User" u ON u.id=p."registeredById" WHERE p."deletedAt" IS NULL ORDER BY p."registeredAt" DESC,p.id');
    return rows.map(p=>({...p,phone:decryptPhone(p.phone,config.PHONE_ENCRYPTION_KEY)}));
  };
  app.get('/api/people',async(req,res)=>{
    let rows=await peopleWithPhones();
    const programs=[...new Set(rows.map(x=>x.programName))].sort();
    const years=[...new Set(rows.map(x=>new Date(x.registeredAt).getUTCFullYear()))].sort((a,b)=>b-a);
    const q=String(req.query.q||'').trim().slice(0,200).toLowerCase();
    if(q) rows=rows.filter(p=>[p.name,p.programName,p.reason,p.memo||'',p.phone].some(v=>v.toLowerCase().includes(q)) || (q.replace(/\D/g,'').length>=3 && p.phone.includes(q.replace(/\D/g,''))));
    if(req.query.program) rows=rows.filter(p=>p.programName===req.query.program);
    if(req.query.year) rows=rows.filter(p=>String(new Date(p.registeredAt).getUTCFullYear())===req.query.year);
    const total=rows.length,page=Math.max(1,Number.parseInt(req.query.page,10)||1),pageSize=25;
    res.json({rows:rows.slice((page-1)*pageSize,page*pageSize).map(({phone,...p})=>p),total,page,pageSize,programs,years});
  });
  app.get('/api/people/:id',async(req,res)=>{
    const {rows}=await pool.query('SELECT * FROM "RestrictedPerson" WHERE id=$1 AND "deletedAt" IS NULL',[req.params.id]);
    if(!rows[0]) throw new HttpError(404,'대상자를 찾을 수 없습니다.');
    await audit(pool,req,'VIEW_PHONE','RestrictedPerson',req.params.id);
    res.json({...rows[0],phone:decryptPhone(rows[0].phone,config.PHONE_ENCRYPTION_KEY)});
  });
  const insertPerson=async(c,req,row)=>{
    const p=validatePerson(row), id=randomUUID();
    const current=await c.query('SELECT phone FROM "RestrictedPerson" WHERE name=$1 AND "programName"=$2 AND "deletedAt" IS NULL',[p.name,p.programName]);
    if(current.rows.some(x=>decryptPhone(x.phone,config.PHONE_ENCRYPTION_KEY)===p.phone)) throw new HttpError(409,'같은 이름·전화번호·사업의 대상자가 이미 등록되어 있습니다.');
    const after={...p,id,phoneMasked:maskPhone(p.phone)};
    await c.query('INSERT INTO "RestrictedPerson" (id,name,phone,"phoneMasked","programName",reason,memo,"registeredAt","registeredById","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)',
      [id,p.name,encryptPhone(p.phone,config.PHONE_ENCRYPTION_KEY),after.phoneMasked,p.programName,p.reason,p.memo,p.registeredAt,req.user.id]);
    await audit(c,req,'CREATE','RestrictedPerson',id,null,after);
    return id;
  };
  app.post('/api/people',async(req,res)=>{
    const person=validatePerson(req.body);
    const id=await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(823402)');return insertPerson(c,req,person);});
    res.status(201).json({id});
  });
  app.put('/api/people/:id',async(req,res)=>{
    const p=validatePerson(req.body);
    const version=z.iso.datetime({offset:true}).parse(req.body.updatedAt);
    await transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(823402)');
      const before=(await c.query('SELECT * FROM "RestrictedPerson" WHERE id=$1 AND "deletedAt" IS NULL FOR UPDATE',[req.params.id])).rows[0];
      if(!before) throw new HttpError(404,'대상자를 찾을 수 없습니다.');
      if(new Date(before.updatedAt).toISOString()!==new Date(version).toISOString()) throw new HttpError(409,'다른 직원이 수정했습니다. 목록을 새로고침해 주세요.');
      const duplicates=await c.query('SELECT phone FROM "RestrictedPerson" WHERE id<>$1 AND name=$2 AND "programName"=$3 AND "deletedAt" IS NULL',[req.params.id,p.name,p.programName]);
      if(duplicates.rows.some(x=>decryptPhone(x.phone,config.PHONE_ENCRYPTION_KEY)===p.phone)) throw new HttpError(409,'동일한 대상자가 이미 있습니다.');
      await c.query('UPDATE "RestrictedPerson" SET name=$2,phone=$3,"phoneMasked"=$4,"programName"=$5,reason=$6,memo=$7,"registeredAt"=$8,"updatedAt"=GREATEST(CURRENT_TIMESTAMP,"updatedAt"+interval \'1 millisecond\') WHERE id=$1',
        [req.params.id,p.name,encryptPhone(p.phone,config.PHONE_ENCRYPTION_KEY),maskPhone(p.phone),p.programName,p.reason,p.memo,p.registeredAt]);
      await audit(c,req,'UPDATE','RestrictedPerson',req.params.id,before,{...p,phoneMasked:maskPhone(p.phone)});
    });res.json({ok:true});
  });
  app.delete('/api/people/:id',admin,async(req,res)=>{
    const reason=z.string().trim().min(1).max(1000).parse(req.body.reason);
    await transaction(async c=>{
      const before=(await c.query('SELECT * FROM "RestrictedPerson" WHERE id=$1 AND "deletedAt" IS NULL FOR UPDATE',[req.params.id])).rows[0];
      if(!before) throw new HttpError(404,'대상자를 찾을 수 없습니다.');
      await c.query('UPDATE "RestrictedPerson" SET "deletedAt"=CURRENT_TIMESTAMP,"deletedReason"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id,reason]);
      await audit(c,req,'DELETE','RestrictedPerson',req.params.id,before,{deletedReason:reason});
    });res.json({ok:true});
  });
  app.post('/api/compare',async(req,res)=>{
    const {rows}=applicantsSchema.parse(req.body);
    let result;
    try {result=classifyApplicants(rows,await peopleWithPhones());} catch {throw new HttpError(400,'명단의 이름과 전체 전화번호를 확인해 주세요.');}
    await audit(pool,req,'COMPARE','Roster',null,null,{count:rows.length});
    res.json({rows:result.map(r=>({...r,matches:r.matches.map(p=>({id:p.id,name:p.name,phoneMasked:p.phoneMasked,programName:p.programName,reason:p.reason,registeredAt:p.registeredAt}))}))});
  });
  app.post('/api/bulk',async(req,res)=>{
    const rows=z.array(z.unknown()).min(1).max(2000).parse(req.body.rows).map(validatePerson);
    const ids=await transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(823402)');
      const ids=[];for(const row of rows) ids.push(await insertPerson(c,req,row));return ids;
    });res.status(201).json({count:ids.length});
  });
  app.get('/api/audit',admin,async(req,res)=>{
    const page=Math.max(1,Number.parseInt(req.query.page,10)||1),size=30;
    const rows=(await pool.query('SELECT a.id,a.action,a."targetType",a."targetId",a."createdAt",u.name "userName" FROM "AuditLog" a LEFT JOIN "User" u ON u.id=a."userId" ORDER BY a."createdAt" DESC LIMIT $1 OFFSET $2',[size,(page-1)*size])).rows;
    const total=(await pool.query('SELECT count(*)::int n FROM "AuditLog"')).rows[0].n;
    res.json({rows,total,page,pageSize:size});
  });
  app.get('/api/users',admin,async(req,res)=>{
    const rows=(await pool.query('SELECT u.id,u.name,u.email,u.role,u."createdAt",coalesce(s.disabled,false) disabled FROM "User" u LEFT JOIN "RecoveryAccountState" s ON s."userId"=u.id ORDER BY u."createdAt"')).rows;
    res.json({rows});
  });
  app.post('/api/users',admin,async(req,res)=>{
    const u=accountSchema.parse(req.body),id=randomUUID(),hash=await bcrypt.hash(u.password,12);
    await transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(823403)');
      if((await c.query('SELECT 1 FROM "User" WHERE lower(email)=lower($1)',[u.email])).rowCount) throw new HttpError(409,'이미 사용 중인 아이디입니다.');
      await c.query('INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',[id,u.name,u.email.toLowerCase(),hash,u.role]);
      await audit(c,req,'CREATE_USER','User',id,null,{name:u.name,email:u.email,role:u.role});
    });res.status(201).json({id});
  });
  app.put('/api/users/:id',admin,async(req,res)=>{
    const input=z.object({name:z.string().trim().min(1).max(100),role:z.enum(['ADMIN','USER']),disabled:z.boolean(),password:z.string().min(12).max(128).optional()}).parse(req.body);
    await transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(823403)');
      const before=(await c.query('SELECT * FROM "User" WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!before) throw new HttpError(404,'사용자를 찾을 수 없습니다.');
      if(req.params.id===req.user.id && (input.disabled||input.role!=='ADMIN')) throw new HttpError(400,'현재 관리자 본인을 비활성화하거나 권한을 내릴 수 없습니다.');
      await c.query('UPDATE "User" SET name=$2,role=$3,"passwordHash"=coalesce($4,"passwordHash"),"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id,input.name,input.role,input.password?await bcrypt.hash(input.password,12):null]);
      await c.query('INSERT INTO "RecoveryAccountState" ("userId",disabled) VALUES ($1,$2) ON CONFLICT ("userId") DO UPDATE SET disabled=$2',[req.params.id,input.disabled]);
      await c.query('DELETE FROM "RecoverySession" WHERE sess->>\'userId\'=$1',[req.params.id]);
      await audit(c,req,'UPDATE_USER','User',req.params.id,{name:before.name,role:before.role},{name:input.name,role:input.role,disabled:input.disabled,passwordChanged:!!input.password});
    });res.json({ok:true});
  });
  app.post('/api/password',async(req,res)=>{
    const input=z.object({currentPassword:z.string().max(128),newPassword:z.string().min(12).max(128)}).parse(req.body);
    if(!await bcrypt.compare(input.currentPassword,req.user.passwordHash)) throw new HttpError(400,'현재 비밀번호가 다릅니다.');
    await transaction(async c=>{
      await c.query('UPDATE "User" SET "passwordHash"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1',[req.user.id,await bcrypt.hash(input.newPassword,12)]);
      await c.query('DELETE FROM "RecoverySession" WHERE sess->>\'userId\'=$1',[req.user.id]);
      await audit(c,req,'CHANGE_PASSWORD','User',req.user.id);
    });await new Promise(r=>req.session.destroy(r));res.clearCookie('black.sid');res.json({ok:true});
  });
  app.use('/api',(req,res,next)=>next(new HttpError(404,'요청한 기능이 없습니다.')));
  app.use(express.static(join(root,'dist')));
  app.get('/{*path}',(req,res)=>res.sendFile(join(root,'dist','index.html')));
  app.use((err,req,res,next)=>{
    if(res.headersSent) return next(err);
    if(err instanceof z.ZodError) return res.status(400).json({error:'입력값을 확인해 주세요. 이름·전화번호·사업·사유·날짜는 필수입니다. 비밀번호는 12자 이상이어야 합니다.'});
    if(err.code==='23505') return res.status(409).json({error:'이미 등록된 값입니다.'});
    if(err.type==='entity.parse.failed') return res.status(400).json({error:'올바른 JSON 요청이 아닙니다.'});
    if(err.type==='entity.too.large') return res.status(413).json({error:'명단 크기가 너무 큽니다. 최대 2000행으로 나누어 주세요.'});
    res.status(err.status||500).json({error:err.status?err.message:'처리 중 오류가 발생했습니다. 서버 상태를 확인해 주세요.'});
    if(!err.status) console.error('Request failed:',err.code||err.name); // no records, credentials or SQL parameters
  });
  return app;
}
