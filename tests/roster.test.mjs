import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseRosterText, readRosterFile, buildResultWorkbook } from '../src/roster.mjs';

test('text parser accepts Korean CSV, TSV and plain lines without losing first person',()=>{
  assert.deepEqual(parseRosterText('이름,전화번호\n홍길동,010-1234-5678'),[{name:'홍길동',phone:'01012345678'}]);
  assert.equal(parseRosterText('홍길동\t01012345678\n김하나\t01099998888').length,2);
  assert.equal(parseRosterText('홍길동 010-1234-5678')[0].name,'홍길동');
  assert.throws(()=>parseRosterText('이름,전화번호\n홍길동,잘못된번호'),/2행/);
  assert.throws(()=>parseRosterText('홍길동,01012345678\n'.repeat(2001)),/2000/);
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
