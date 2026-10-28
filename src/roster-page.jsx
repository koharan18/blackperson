import React, {useEffect, useRef, useState} from 'react';
import {Heading, Alert, Field, Badge, dateInput, Empty} from './components.jsx';
import {api} from './api.mjs';

export default function Roster({mode, go}) {
  const bulk = mode === 'bulk';
  const [tab, setTab] = useState('file'), [text, setText] = useState(''), [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [rowErrors, setRowErrors] = useState([]);
  const [results, setResults] = useState(null), [filter, setFilter] = useState('전체');
  const [common, setCommon] = useState({programName: '', reason: '', registeredAt: dateInput(), memo: ''});
  const generation = useRef(0);
  useEffect(() => () => {generation.current++;}, []);

  function invalidateInput() {generation.current++; setPreview([]); setRowErrors([]); setResults(null); setBusy(false); setError(''); setFileName('');}
  function switchTab(next) {invalidateInput(); setTab(next);}
  async function loadFile(file) {
    if (!file) return;
    const request = ++generation.current;
    setBusy(true); setError(''); setPreview([]); setRowErrors([]); setResults(null); setFileName('');
    try {
      const {readRosterFileDetailed} = await import('./roster.mjs');
      const {rows, errors} = await readRosterFileDetailed(file);
      if (request !== generation.current) return;
      setPreview(rows); setRowErrors(errors); setFileName(file.name);
    } catch (e) {if (request === generation.current) setError(e.message);}
    finally {if (request === generation.current) setBusy(false);}
  }
  async function parse() {
    const request = ++generation.current;
    setError(''); setBusy(true); setPreview([]); setRowErrors([]); setResults(null);
    try {
      const {parseRosterTextDetailed} = await import('./roster.mjs');
      const {rows, errors} = parseRosterTextDetailed(text);
      if (request === generation.current) {setPreview(rows); setRowErrors(errors);}
    } catch (e) {if (request === generation.current) setError(e.message);}
    finally {if (request === generation.current) setBusy(false);}
  }
  async function submit(e) {
    e.preventDefault(); if (!preview.length) return;
    const request = generation.current;
    setBusy(true); setError('');
    try {
      if (bulk) {
        const {mergeBulkRow}=await import('./roster.mjs');
        const rows=preview.map((row,index)=>{try{return mergeBulkRow(row,common);}catch(error){throw new Error(`${index+1}행: ${error.message}`);}});
        const data = await api('/bulk', {method: 'POST', body: {rows}});
        go('/people', `${data.count}명의 대상자를 등록했습니다.`);
      } else {
        const data = await api('/compare', {method: 'POST', body: {rows: preview}});
        if (request === generation.current) {setResults(data.rows); setFilter('전체');}
      }
    } catch (e) {if (request === generation.current) setError(e.message);}
    finally {if (request === generation.current) setBusy(false);}
  }
  async function download() {
    setBusy(true);
    try {
      const {buildResultWorkbook, downloadWorkbook} = await import('./roster.mjs');
      downloadWorkbook(await buildResultWorkbook(results), 'BLACK_명단확인_' + dateInput() + '.xlsx');
    } catch (e) {setError(e.message);} finally {setBusy(false);}
  }

  const fileInput = <input className="visually-hidden" id="roster-file" type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={e => {const file=e.target.files[0];e.target.value='';loadFile(file);}}/>;
  const textInput = <>
    <Field label="명단 텍스트" hint="이름과 전체 전화번호를 한 줄에 한 명씩 입력하세요. 쉼표·탭으로 구분할 수 있습니다.">
      <textarea rows={bulk ? 12 : 7} value={text} onChange={e => {invalidateInput(); setText(e.target.value);}} placeholder={'홍길동 010-0000-0000\n김하나 01011112222\n이서준 010-3333-4444'}/>
    </Field>
    <button type="button" className="button" onClick={parse} disabled={busy || !text.trim()}>명단 미리보기</button>
  </>;
  const visible = results && (filter === '전체' ? results : results.filter(row => row.status === filter));
  const needsProgram = !preview.length || preview.some(row => !row.programName);
  const needsReason = !preview.length || preview.some(row => !row.reason);

  return <>
    <Heading title={bulk ? '일괄 등록' : '명단 확인'} description={bulk ? '파일을 올리거나 이름과 전화번호를 붙여넣어 여러 명을 한 번에 등록합니다.' : '신청자 명단은 저장하지 않습니다. 기존 제한 이력과 비교한 결과만 보여줍니다.'}/>
    {bulk && <div className="notice-box"><strong>등록 전 확인</strong><p>이 화면에서 등록하면 실제 제한 대상자가 됩니다. 비교만 하려면 명단 확인을 사용하세요.</p></div>}
    <form onSubmit={submit}>
      <div className={bulk ? 'roster-layout bulk-layout' : 'roster-layout compare-layout'}>
        <section className="roster-input">
          {bulk ? <><h2>파일 또는 텍스트 입력</h2><p className="section-description">먼저 등록할 명단을 불러오세요.</p></> : <div className="input-tabs" role="group" aria-label="명단 입력 방식"><button type="button" className={tab === 'file' ? 'selected' : ''} onClick={() => switchTab('file')}>파일로 확인</button><button type="button" className={tab === 'text' ? 'selected' : ''} onClick={() => switchTab('text')}>텍스트로 확인</button></div>}
          <div className="workflow-step"><span>1. 명단 입력</span>{!bulk && <p>파일을 올리거나 텍스트를 붙여넣어 확인할 명단을 준비하세요.</p>}</div>
          {fileInput}
          {bulk ? <><label className="compact-file" htmlFor="roster-file"><strong>{fileName || 'CSV 또는 XLSX 파일 선택'}</strong><span>최대 2,000명</span></label>{textInput}</> : tab === 'file' ? <label className="dropzone" htmlFor="roster-file" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); loadFile(e.dataTransfer.files[0]);}}><strong>신청자 명단 파일 선택</strong><p>{fileName || 'CSV 또는 XLSX 파일을 올리면 이름과 전화번호 열을 읽습니다. 올린 파일은 저장하지 않습니다.'}</p><span className="button primary file-button">파일 선택</span><small>XLSX · CSV · TSV · TXT / 최대 10MB, 2,000명</small></label> : <div className="text-input-area">{textInput}</div>}
          {busy && !results && <p className="processing-status" role="status">명단을 처리하고 있습니다…</p>}
        </section>
        {bulk && <section className="common-fields"><h2>공통 등록 정보</h2><p className="section-description">파일의 개별 사업·사유를 우선 사용하며, 빈 항목에만 아래 값을 적용합니다.</p><div className="workflow-step"><span>2. 공통 정보</span></div>
          <Field label="공통 참여 사업" required={needsProgram} hint={needsProgram?'파일에 사업이 없는 행에 적용합니다.':'모든 행에 개별 사업이 있습니다. 공통값은 비워도 됩니다.'}><input required={needsProgram} maxLength={200} value={common.programName} onChange={e => setCommon({...common, programName: e.target.value})} placeholder="참여 사업을 입력하세요"/></Field>
          <Field label="공통 제한 사유" required={needsReason} hint={needsReason?'파일에 사유가 없는 행에 적용합니다.':'모든 행에 개별 사유가 있습니다. 공통값은 비워도 됩니다.'}><textarea required={needsReason} rows={2} maxLength={2000} value={common.reason} onChange={e => setCommon({...common, reason: e.target.value})} placeholder="예: 중복 신청, 참여 기준 미충족"/></Field>
          <Field label="공통 등록일" required><input required type="date" value={common.registeredAt} onChange={e => setCommon({...common, registeredAt: e.target.value})}/></Field>
          <Field label="공통 메모"><input maxLength={4000} value={common.memo} onChange={e => setCommon({...common, memo: e.target.value})} placeholder="선택 입력"/></Field>
        </section>}
      </div>
      <Alert>{error}</Alert>
      {rowErrors.length>0&&<div className="row-error-notice" role="alert"><strong>확인 필요 {rowErrors.length}행 — 오류가 있는 행은 처리 대상에서 제외됩니다.</strong><ul>{rowErrors.slice(0,10).map(issue=><li key={issue.row}>{issue.message}</li>)}</ul>{rowErrors.length>10&&<p>외 {rowErrors.length-10}행. 원본의 번호를 보완한 뒤 다시 올려 주세요.</p>}</div>}
      {preview.length > 0 ? <>
        <div className="workflow-step preview-step"><span>{bulk ? '3. 등록 내용 확인' : '2. 입력 내용 확인'}</span><p>미리보기의 이름과 전화번호를 확인한 후 진행하세요.</p></div>
        <section className={'panel preview-panel '+(bulk?'bulk-preview':'')}><div className="panel-heading"><div><h2>명단 미리보기</h2><p>정상 {preview.length}건 · 오류 {rowErrors.length}건</p></div><button className="button primary" disabled={busy}>{busy ? '처리 중…' : bulk ? `${preview.length}명 일괄 등록` : '기존 이력과 비교'}</button></div>
          <div className="table-scroll preview-table"><table><thead><tr><th>상태</th><th>이름</th><th>전화번호</th><th>{bulk?'참여 사업':'신청사업'}</th>{bulk&&<><th>제한 사유</th><th>내부 메모</th></>}</tr></thead><tbody>{preview.slice(0, 100).map((row, i) => <tr key={i}><td><Badge>정상</Badge></td><td><strong>{row.name}</strong></td><td className="phone-cell">{row.phone}</td><td className="muted">{row.programName || (bulk ? common.programName || '-' : '-')}</td>{bulk&&<><td>{row.reason||common.reason||'-'}</td><td className="muted memo-preview">{[row.memo,common.memo].filter(Boolean).join('\n')||'-'}</td></>}</tr>)}</tbody></table></div>
          {preview.length > 100 && <p className="preview-note">미리보기는 처음 100명입니다. 전체 {preview.length}명을 처리합니다.</p>}
        </section>
      </> : <section className="roster-empty"><Empty title={bulk ? '등록할 명단이 없습니다.' : '확인할 명단이 없습니다.'} description="파일을 올리거나 이름과 전화번호를 붙여넣어 주세요."/></section>}
    </form>
    {results && <section className="comparison-results">
      <div className="notice-box"><strong>명단 확인</strong><p>{results.length}건 검사가 완료되었습니다.</p></div>
      <div className="workflow-step"><span>3. 검사 결과</span><p>결과는 파일로 내려받아 업무에 사용할 수 있습니다.</p></div>
      <div className="panel result-panel"><div className="panel-heading"><div><h2>검사 결과</h2><p>{['일치', '확인 필요', '미등록'].map(status => `${status} ${results.filter(row => row.status === status).length}건`).join(' · ')}</p></div><div className="result-actions"><select aria-label="결과 필터" value={filter} onChange={e => setFilter(e.target.value)}>{['전체', '일치', '확인 필요', '미등록'].map(status => <option key={status}>{status}</option>)}</select><button className="button" disabled={busy} onClick={download}>결과 엑셀 다운로드</button></div></div>
        {visible.length ? <div className="table-scroll"><table className="results-table"><thead><tr><th>판정</th><th>입력 이름</th><th>입력 전화번호</th><th>매칭 정보</th><th>참여 사업</th><th>제한 사유</th></tr></thead><tbody>{visible.map((row, i) => <tr key={i} className={row.status === '일치' ? 'match-exact' : row.status === '확인 필요' ? 'match-possible' : ''}><td><Badge>{row.status}</Badge></td><td><strong>{row.name}</strong></td><td className="phone-cell">{row.phone}</td><td>{row.matches.length ? row.matches.map(p => <div className="match-record" key={p.id}>{p.name} · {p.phoneMasked}</div>) : <span className="muted">기존 제한 이력과 일치하지 않습니다.</span>}</td><td>{row.matches.length ? row.matches.map(p => <div className="match-record muted" key={p.id}>{p.programName}</div>) : '-'}</td><td>{row.matches.length ? row.matches.map(p => <div className="match-record muted" key={p.id}>{p.reason}</div>) : '-'}</td></tr>)}</tbody></table></div> : <Empty title="해당 결과가 없습니다" description="다른 결과 분류를 선택해 주세요."/>}
      </div>
    </section>}
  </>;
}
