import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

export function normalizePhone(value) {
  let phone = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(phone)) throw new Error('전화번호를 숫자로 입력해 주세요.');
  phone = phone.replace(/[\s().-]/g, '');
  if (phone.startsWith('+82')) phone = '0' + phone.slice(3);
  if (!/^0\d{8,10}$/.test(phone)) throw new Error('전화번호는 0으로 시작하는 9~11자리여야 합니다.');
  return phone;
}

export function maskPhone(value) {
  const p = normalizePhone(value);
  return `${p.slice(0, p.startsWith('02') ? 2 : 3)}-****-${p.slice(-4)}`;
}

function keyBytes(value) {
  if (/^[a-f\d]{64}$/i.test(value ?? '')) return Buffer.from(value, 'hex');
  const b = Buffer.from(value ?? '', 'base64');
  if (b.length === 32) return b;
  throw new Error('PHONE_ENCRYPTION_KEY 형식을 확인해 주세요. 원본 키가 필요합니다.');
}

export function encryptPhone(phone, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  const data = Buffer.concat([cipher.update(normalizePhone(phone), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}

export function decryptPhone(value, key) {
  if (value.includes('.')) {
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some(x => !/^[A-Za-z\d+/]+={0,2}$/.test(x))) throw new Error('기존 암호화 데이터가 손상되었습니다.');
    const [iv, tag, data] = parts.map(x => Buffer.from(x, 'base64'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error('기존 암호화 데이터 형식이 다릅니다.');
    const d = createDecipheriv('aes-256-gcm', keyBytes(key), iv);
    d.setAuthTag(tag);
    return normalizePhone(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  }
  const parts = value.split(':');
  if (parts[0] !== 'v1' || parts.length !== 4) throw new Error('알 수 없는 전화번호 암호화 형식입니다.');
  const [, iv, tag, data] = parts;
  if (!/^[a-f\d]{24}$/i.test(iv) || !/^[a-f\d]{32}$/i.test(tag) || !/^(?:[a-f\d]{2})+$/i.test(data)) throw new Error('암호화 데이터가 손상되었습니다.');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return normalizePhone(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'));
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
}, '올바른 날짜를 입력해 주세요.');
const text = max => z.string().trim().min(1).max(max);
const personSchema = z.object({
  name: text(100), phone: z.string().transform((v,ctx)=>{try{return normalizePhone(v);}catch(e){ctx.addIssue({code:'custom',message:e.message});return z.NEVER;}}), programName: text(200),
  reason: text(2000), memo: z.string().trim().max(4000).optional().default(''), registeredAt: date,
});
export const validatePerson = input => personSchema.parse(input);

export function classifyApplicants(applicants, people) {
  const active = people.filter(x => !x.deletedAt).map(p => ({ ...p, phone: normalizePhone(p.phone) }));
  return applicants.map(a => {
    const name = String(a.name).trim().normalize('NFC');
    const phone = normalizePhone(a.phone);
    const exact = active.filter(p => p.name.trim().normalize('NFC') === name && p.phone === phone);
    const possible = exact.length ? exact : active.filter(p => p.name.trim().normalize('NFC') === name || p.phone === phone);
    return { name, phone, status: exact.length ? '일치' : possible.length ? '확인 필요' : '미등록', matches: possible };
  });
}
