import React, {useState} from 'react';
import {api} from './api.mjs';
import {Alert, Field} from './components.jsx';

export default function Login({onLogin, error: initialError}) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialError);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {await api('/session'); const data = await api('/login', {method: 'POST', body: {email, password}}); onLogin(data.user);}
    catch (e) {setError(e.message);} finally {setBusy(false);}
  }
  return <div className="login-page">
    <header className="login-header"><a className="brand" href="/login"><span className="brand-symbol" aria-hidden="true">B</span><span>BLACK</span></a></header>
    <main className="login-layout">
      <section className="login-intro"><p className="login-kicker">내부 제한 이력 관리</p><h2>BLACK</h2><p className="login-summary">제한 이력을 등록하고 찾고, 신청자 명단을 확인하는 내부 업무 도구입니다.</p><div className="login-internal">내부 업무용 · 외부 공유 금지</div></section>
      <section className="login-form-panel"><p className="login-kicker">내부 콘솔</p><h1>로그인</h1><p className="login-description">회사 내부 담당자 계정으로 접속해주세요.</p><Alert>{error}</Alert>
        <form onSubmit={submit}><Field label="아이디"><input required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></Field><Field label="비밀번호"><input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></Field><button className="button primary login-submit" disabled={busy}>{busy ? '접속 중…' : '관리 콘솔 접속'}</button></form>
        <p className="login-session-note">세션은 일정 시간 후 만료됩니다. 공용 PC에서는 작업 후 반드시 로그아웃하세요.</p>
      </section>
    </main>
  </div>;
}
