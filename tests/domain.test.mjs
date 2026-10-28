import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv } from 'node:crypto';
import { normalizePhone, maskPhone, encryptPhone, decryptPhone, classifyApplicants, validatePerson } from '../server/domain.mjs';

test('phone formatting normalizes but refuses missing/invalid digits', () => {
  assert.equal(normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(normalizePhone('+82 10 1234 5678'), '01012345678');
  assert.throws(() => normalizePhone('1234'));
  assert.throws(() => normalizePhone('abc01012345678'));
  assert.equal(maskPhone('01012345678'), '010-****-5678');
});

test('authenticated phone encryption rejects a wrong key and tampering', () => {
  const key = randomBytes(32).toString('hex');
  const cipher = encryptPhone('01012345678', key);
  assert.ok(!cipher.includes('01012345678'));
  assert.equal(decryptPhone(cipher, key), '01012345678');
  assert.throws(() => decryptPhone(cipher, randomBytes(32).toString('hex')));
  assert.throws(() => decryptPhone(cipher.slice(0, -3) + 'aaa', key));
});

test('legacy dot-separated base64 GCM phones remain readable', () => {
  const key = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update('010-1234-5678'), c.final()]);
  const legacy = [iv, c.getAuthTag(), data].map(x => x.toString('base64')).join('.');
  assert.equal(decryptPhone(legacy, key.toString('base64')), '01012345678');
});

test('matching distinguishes exact, ambiguous, absent and deleted records', () => {
  const people = [
    { id: 'a', name: '홍길동', phone: '01012345678', programName: '사업A' },
    { id: 'b', name: '김하나', phone: '01099998888', programName: '사업B' },
    { id: 'c', name: '삭제됨', phone: '01011112222', deletedAt: '2026-01-01' },
  ];
  const result = classifyApplicants([
    { name: ' 홍길동 ', phone: '010-1234-5678' },
    { name: '홍길동', phone: '01000001111' },
    { name: '다른사람', phone: '01099998888' },
    { name: '길동', phone: '01044445555' },
    { name: '삭제됨', phone: '01011112222' },
  ], people);
  assert.deepEqual(result.map(x => x.status), ['일치', '확인 필요', '확인 필요', '미등록', '미등록']);
  assert.equal(result[0].matches[0].id, 'a');
});

test('record validation rejects impossible dates and empty reasons', () => {
  const row = { name: '홍길동', phone: '01012345678', programName: '사업', reason: '사유', registeredAt: '2026-10-28' };
  assert.equal(validatePerson(row).name, row.name);
  assert.throws(() => validatePerson({ ...row, registeredAt: '2026-02-30' }));
  assert.throws(() => validatePerson({ ...row, reason: ' ' }));
});
