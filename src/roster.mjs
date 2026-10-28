import Papa from 'papaparse';
import ExcelJS from 'exceljs';

function phoneText(v) {
  let text=String(v??'').trim();
  if(typeof v==='number' && /^1\d{9}$/.test(text)) text='0'+text;
  if(!/^[+\d\s().-]+$/.test(text)) throw new Error('전화번호 형식이 올바르지 않습니다.');
  text=text.replace(/[\s().-]/g,'');if(text.startsWith('+82')) text='0'+text.slice(3);
  if(!/^0\d{8,10}$/.test(text)) throw new Error('전체 전화번호를 입력해 주세요.');
  return text;
}
const nameHeaders=['이름','성명','대상자명','name'];
const phoneHeaders=['전화번호','연락처','휴대폰','휴대전화','휴대폰번호','phone','mobile'];
function parseRows(rows) {
  const nonempty=rows.map((row,index)=>({row,index})).filter(({row})=>row.some(v=>String(v??'').trim()));
  if(!nonempty.length) throw new Error('명단을 입력해 주세요.');
  const headers=nonempty[0].row.map(v=>String(v??'').replace(/\s/g,'').toLowerCase());
  let nameIndex=headers.findIndex(v=>nameHeaders.includes(v)),phoneIndex=headers.findIndex(v=>phoneHeaders.includes(v));
  const hasHeader=nameIndex>=0||phoneIndex>=0;
  if(hasHeader && (nameIndex<0||phoneIndex<0)) throw new Error('첫 행에 이름과 전화번호 열이 모두 필요합니다.');
  if(!hasHeader){nameIndex=0;phoneIndex=1;}
  const data=hasHeader?nonempty.slice(1):nonempty;
  if(!data.length) throw new Error('머리글 아래에 대상자를 입력해 주세요.');
  if(data.length>2000) throw new Error('한 번에 최대 2000명까지 처리할 수 있습니다.');
  return data.map(({row,index})=>{
    try {
      const name=String(row[nameIndex]??'').trim();if(!name||name.length>100) throw new Error('이름을 확인해 주세요.');
      return {name,phone:phoneText(row[phoneIndex])};
    }catch(e){throw new Error(`${index+1}행: ${e.message}`);}
  });
}
export function parseRosterText(text) {
  text=String(text).replace(/^\uFEFF/,'').trim();
  if(!text) throw new Error('명단을 입력해 주세요.');
  if(!text.includes(',')&&!text.includes('\t')&&!text.includes(';')) return parseRows(text.split(/\r?\n/).map(line=>{
    const m=line.trim().match(/^(.+?)\s+([+\d][\d\s().-]*)$/);return m?[m[1],m[2]]:[line];
  }));
  const parsed=Papa.parse(text,{skipEmptyLines:'greedy',delimitersToGuess:[',','\t',';']});
  if(parsed.errors.some(e=>e.code!=='UndetectableDelimiter')) throw new Error('명단 구분자 또는 따옴표를 확인해 주세요.');
  return parseRows(parsed.data);
}
export async function readRosterFile(file) {
  if(file.size>10*1024*1024) throw new Error('파일은 10MB 이하만 업로드할 수 있습니다.');
  if(/\.(csv|txt|tsv)$/i.test(file.name)) return parseRosterText(await file.text());
  if(!/\.xlsx$/i.test(file.name)) throw new Error('XLSX, CSV, TSV, TXT 파일을 사용해 주세요.');
  const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
  const sheet=book.worksheets[0];if(!sheet) throw new Error('빈 엑셀 파일입니다.');
  if(sheet.rowCount>2001) throw new Error('한 번에 최대 2000명까지 처리할 수 있습니다.');
  const rows=[];sheet.eachRow({includeEmpty:true},row=>rows.push(row.values.slice(1).map(cell=>{
    if(cell&&typeof cell==='object') {
      if('formula' in cell||'sharedFormula' in cell) throw new Error('수식 대신 값만 붙여넣은 파일을 사용해 주세요.');
      if('richText' in cell) return cell.richText.map(x=>x.text).join('');
      if('text' in cell) return cell.text;
    }return cell;
  })));
  return parseRows(rows);
}
export async function buildResultWorkbook(rows) {
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('명단 확인 결과');
  sheet.columns=[{header:'이름',key:'name',width:18},{header:'전화번호',key:'phone',width:20},{header:'확인 결과',key:'status',width:16},{header:'참여 사업',key:'programs',width:30},{header:'제한 사유',key:'reasons',width:50}];
  for(const r of rows) sheet.addRow({name:r.name,phone:r.phone,status:r.status,programs:(r.matches||[]).map(x=>x.programName).join('\n'),reasons:(r.matches||[]).map(x=>x.reason).join('\n')});
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183B32'}};
  sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:E1';
  sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});
  return book.xlsx.writeBuffer();
}
export function downloadWorkbook(bytes,name) {
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
