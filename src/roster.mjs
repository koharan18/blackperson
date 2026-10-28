import Papa from 'papaparse';
import ExcelJS from 'exceljs';

function phoneText(value) {
  let text=String(value??'').trim();
  if(!/^[+\d\s().-]+$/.test(text)) throw new Error('전화번호가 없거나 형식이 올바르지 않습니다.');
  text=text.replace(/[\s().-]/g,'');
  if(text.startsWith('+82')) text='0'+text.slice(3);
  if(/^1\d{9}$/.test(text)) text='0'+text;
  if(!/^0\d{8,10}$/.test(text)) throw new Error('전체 전화번호를 입력해 주세요.');
  return text;
}

const aliases={
  name:['이름','성명','대상자명','name'],
  phone:['전화번호','연락처','휴대폰','휴대전화','휴대폰번호','phone','mobile'],
  region:['지역','거주지','거주지역','주소','구','region','district'],
  programName:['참여사업','신청사업','사업','사업명','programname','program'],
  reason:['제한사유','참여제한사유','사유','reason'],
  memo:['내부메모','원문메모','메모','비고','memo','note'],
  registeredAt:['등록일','등록일자','registeredat'],
};
const clean=value=>value instanceof Date?value.toISOString().slice(0,10):String(value??'').trim();
const isRegion=value=>/^(?:[^\s]{1,8}(?:구|시|군|도|동)|강북|강동|도봉|동대문|의정부|남양주)$/.test(value);
function checkOptionalFields(row) {
  for(const [key,max,label] of [['programName',200,'참여 사업'],['reason',2000,'제한 사유'],['memo',4000,'메모']])if(row[key]&&row[key].length>max)throw new Error(`${label}는 ${max}자 이하여야 합니다.`);
  if(row.registeredAt){
    const date=new Date(row.registeredAt+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row.registeredAt)||Number.isNaN(+date)||date.toISOString().slice(0,10)!==row.registeredAt)throw new Error('등록일을 YYYY-MM-DD 형식의 올바른 날짜로 입력해 주세요.');
  }
  return row;
}
const mobile='(?:\\+82[ .()-]*1[016789]|01[016789]|1[016789])[ .()-]*\\d{3,4}[ .()-]*\\d{4}';
const landline='0(?:2|[3-6]\\d)[ .()-]*\\d{3,4}[ .()-]*\\d{4}';
const plainPattern=new RegExp('^([^,\\t|]+?)\\s*('+mobile+'|'+landline+')(?:\\s+(.*))?$');
function plainRow(line) {
  const match=line.trim().match(plainPattern);
  if(!match)return [line];
  const rest=(match[3]||'').trim(),first=rest.split(/\s+/)[0];
  return isRegion(first)?[match[1],match[2],first,rest.slice(first.length).trim()]:[match[1],match[2],rest];
}
function parseRowsDetailed(rows) {
  const nonempty=rows.map((row,index)=>({row,index})).filter(({row})=>row.some(value=>clean(value)));
  if(!nonempty.length) throw new Error('명단을 입력해 주세요.');
  const headers=nonempty[0].row.map(value=>clean(value).replace(/\s/g,'').toLowerCase());
  const indices=Object.fromEntries(Object.entries(aliases).map(([key,values])=>[key,headers.findIndex(h=>values.includes(h))]));
  const hasHeader=indices.name>=0||indices.phone>=0;
  if(hasHeader&&(indices.name<0||indices.phone<0)) throw new Error('첫 행에 이름과 전화번호 열이 모두 필요합니다.');
  if(!hasHeader){indices.name=0;indices.phone=1;}
  const data=hasHeader?nonempty.slice(1):nonempty;
  if(!data.length) throw new Error('머리글 아래에 대상자를 입력해 주세요.');
  if(data.length>2000) throw new Error('한 번에 최대 2000명까지 처리할 수 있습니다.');
  const result={rows:[],errors:[]};
  for(const {row,index} of data) {
    try {
      const name=clean(row[indices.name]);
      if(!name||name.length>100) throw new Error('이름을 확인해 주세요.');
      const person={name,phone:phoneText(row[indices.phone])};
      for(const key of ['programName','reason','memo','registeredAt']) {
        if(hasHeader&&indices[key]>=0&&clean(row[indices[key]]))person[key]=clean(row[indices[key]]);
      }
      let region=hasHeader&&indices.region>=0?clean(row[indices.region]):'';
      if(!hasHeader&&row.length>=4){region=clean(row[2]);if(clean(row[3]))person.reason=clean(row.slice(3).join(' '));}
      else if(!hasHeader&&row.length===3){if(isRegion(clean(row[2])))region=clean(row[2]);else if(clean(row[2]))person.reason=clean(row[2]);}
      if(region){const district='지역: '+region;person.memo=[district,person.memo].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n');}
      checkOptionalFields(person);
      result.rows.push(person);
    }catch(error){result.errors.push({row:index+1,message:`${index+1}행: ${error.message}`});}
  }
  return result;
}

function textRows(input) {
  const text=String(input).replace(/^\uFEFF/,'').trim();
  if(!text) throw new Error('명단을 입력해 주세요.');
  const lines=text.split(/\r?\n/);
  if(lines.some(line=>/^\s*\|/.test(line)))return lines.filter(line=>line.trim()&&!/^\s*\|?\s*:?-{2,}/.test(line)).map(line=>line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(v=>v.trim().replace(/\\\|/g,'|')));
  if(text.includes('\t')||(/[,;]/.test(lines[0])&&!plainPattern.test(lines[0].trim()))) {
    const delimiter=text.includes('\t')?'\t':lines[0].includes(',')?',':';';
    const parsed=Papa.parse(text,{delimiter,skipEmptyLines:'greedy'});
    if(parsed.errors.length) throw new Error('명단 구분자 또는 따옴표를 확인해 주세요.');
    return parsed.data;
  }
  return lines.map(line=>line.trim()?plainRow(line):[]);
}

export const parseRosterTextDetailed=text=>parseRowsDetailed(textRows(text));
export function parseRosterText(text) {
  const result=parseRosterTextDetailed(text);
  if(result.errors.length)throw new Error(result.errors[0].message);
  return result.rows;
}
export async function readRosterFileDetailed(file) {
  if(file.size>10*1024*1024) throw new Error('파일은 10MB 이하만 업로드할 수 있습니다.');
  if(/\.(csv|txt|tsv)$/i.test(file.name))return parseRosterTextDetailed(await file.text());
  if(!/\.xlsx$/i.test(file.name))throw new Error('XLSX, CSV, TSV, TXT 파일을 사용해 주세요.');
  const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
  const sheet=book.worksheets[0];if(!sheet)throw new Error('빈 엑셀 파일입니다.');
  if(sheet.rowCount>2001)throw new Error('한 번에 최대 2000명까지 처리할 수 있습니다.');
  const rows=[];
  sheet.eachRow({includeEmpty:true},row=>{
    const values=[];
    for(let i=1;i<=sheet.columnCount;i++) {
      let cell=row.getCell(i).value;
      if(cell&&typeof cell==='object'&&!(cell instanceof Date)) {
        if('formula' in cell||'sharedFormula' in cell)throw new Error('수식 대신 값만 붙여넣은 파일을 사용해 주세요.');
        if('richText' in cell)cell=cell.richText.map(x=>x.text).join('');
        else if('text' in cell)cell=cell.text;
      }
      values.push(cell);
    }
    rows.push(values);
  });
  return parseRowsDetailed(rows);
}
export async function readRosterFile(file) {
  const result=await readRosterFileDetailed(file);
  if(result.errors.length)throw new Error(result.errors[0].message);
  return result.rows;
}
export function mergeBulkRow(row,common) {
  return checkOptionalFields({name:row.name,phone:phoneText(row.phone),programName:clean(row.programName)||clean(common.programName),reason:clean(row.reason)||clean(common.reason),registeredAt:clean(row.registeredAt)||clean(common.registeredAt),memo:[clean(row.memo),clean(common.memo)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n')});
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
