import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseRosterText, parseRosterTextDetailed, readRosterFile, buildResultWorkbook, mergeBulkRow } from '../src/roster.mjs';

test('text parser accepts Korean CSV, TSV and plain lines without losing first person',()=>{
  assert.deepEqual(parseRosterText('이름,전화번호\n홍길동,010-1234-5678'),[{name:'홍길동',phone:'01012345678'}]);
  assert.equal(parseRosterText('홍길동\t01012345678\n김하나\t01099998888').length,2);
  assert.equal(parseRosterText('홍길동 010-1234-5678')[0].name,'홍길동');
  assert.throws(()=>parseRosterText('이름,전화번호\n홍길동,잘못된번호'),/2행/);
  assert.throws(()=>parseRosterText('홍길동,01012345678\n'.repeat(2001)),/2000/);
});

test('rich spreadsheet columns and lost leading zeros preserve individual reasons and district',()=>{
  const rows=parseRosterText('이름\t전화번호\t지역\t참여 사업\t제한 사유\t내부 메모\n홍길동\t1012345678\t강북구\t사업A\t개별 사유\t원문 메모');
  assert.equal(rows[0].phone,'01012345678');
  assert.equal(rows[0].programName,'사업A');
  assert.equal(rows[0].reason,'개별 사유');
  assert.match(rows[0].memo,/강북구/);assert.match(rows[0].memo,/원문 메모/);
  const merged=mergeBulkRow(rows[0],{programName:'공통사업',reason:'공통사유',memo:'공통메모',registeredAt:'2026-10-28'});
  assert.equal(merged.reason,'개별 사유');assert.equal(merged.programName,'사업A');
  assert.match(merged.memo,/공통메모/);assert.equal(merged.registeredAt,'2026-10-28');
});

test('pasted markdown and whitespace rows allow valid people while reporting missing phones',()=>{
  const markdown='| 이름 | 전화번호 | 지역 | 사유 |\n|:--:|:--:|:--:|:--:|\n| 홍길동 | 1012345678 | 강북구 | 개별 사유 |\n| 김하나 | | | |';
  const result=parseRosterTextDetailed(markdown);
  assert.equal(result.rows.length,1);assert.equal(result.errors.length,1);
  assert.equal(result.rows[0].reason,'개별 사유');assert.equal(result.rows[0].phone,'01012345678');
  const whitespace=parseRosterText('홍길동01012345678 강북구 개별 사유\n김하나 1099998888 당일 취소');
  assert.equal(whitespace.length,2);assert.equal(whitespace[0].reason,'개별 사유');assert.equal(whitespace[1].phone,'01099998888');assert.equal(whitespace[1].reason,'당일 취소');
});

test('invalid optional fields are reported before bulk registration',()=>{
  const invalid=parseRosterTextDetailed('이름,전화번호,등록일\n가상날짜,01012345678,2026-02-30');
  assert.equal(invalid.rows.length,0);assert.equal(invalid.errors.length,1);
  const long=parseRosterTextDetailed('이름,전화번호,제한 사유\n가상길이,01012345678,'+'사'.repeat(2001));
  assert.equal(long.rows.length,0);assert.equal(long.errors.length,1);
  assert.throws(()=>mergeBulkRow({name:'가상',phone:'01012345678',programName:'사업',reason:'사유',memo:'가'.repeat(3999)},{memo:'나나',registeredAt:'2026-10-28'}),/4000/);
});

test('space-separated phones and commas inside a free-text reason remain accepted',()=>{
  const spaced=parseRosterText('홍길동 010 1234 5678');
  assert.equal(spaced[0].phone,'01012345678');
  const comma=parseRosterText('홍길동 01012345678 당일 취소, 연락 없음');
  assert.equal(comma[0].reason,'당일 취소, 연락 없음');
});

test('reservation exports detect the second-row header and applicant mobile columns',async()=>{
  const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('예약현황');
  sheet.addRow(['예약현황조회']);
  sheet.addRow(['순번','신청자명','핸드폰번호','신청하신 사유/궁금하신 내용']);
  sheet.addRow([1,'가상신청가','01012345678','신청자의 일반 문의']);
  sheet.addRow([2,'가상신청나','1099998888','사업 신청 사유']);
  const bytes=await wb.xlsx.writeBuffer();
  const rows=await readRosterFile({name:'예약현황조회.xlsx',arrayBuffer:async()=>bytes});
  assert.deepEqual(rows,[{name:'가상신청가',phone:'01012345678'},{name:'가상신청나',phone:'01099998888'}]);
  assert.ok(rows.every(row=>!row.reason),'applicant questionnaire must never become restriction reasons');
});

test('XLSX import preserves text phones and export writes literal strings not formulas',async()=>{
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('명단');
  s.addRow(['이름','전화번호']);s.addRow(['홍길동','01012345678']);
  const bytes=await w.xlsx.writeBuffer();
  assert.deepEqual(await readRosterFile({name:'명단.xlsx',arrayBuffer:async()=>bytes}),[{name:'홍길동',phone:'01012345678'}]);
  const result=await buildResultWorkbook([{name:'=HYPERLINK("bad")',phone:'01012345678',status:'미등록',matches:[]}]);
  const read=new ExcelJS.Workbook();await read.xlsx.load(result);
  assert.equal(read.worksheets[0].getCell('A2').type,ExcelJS.ValueType.String);
  assert.equal(read.worksheets[0].getCell('C2').text,'미등록');
});
