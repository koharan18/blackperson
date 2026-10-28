import React, {useEffect, useRef, useState} from 'react';
import {Menu, X} from 'lucide-react';
import {api} from './api.mjs';
import {Alert, Field, Loading, Modal} from './components.jsx';
import {Dashboard, People, PersonForm, Audit, Accounts} from './pages.jsx';
import Roster from './roster-page.jsx';
import Login from './Login.jsx';

const navigation = [['/dashboard', '대시보드'], ['/people', '대상자 목록'], ['/compare', '명단 확인'], ['/new', '신규 등록'], ['/bulk', '일괄 등록']];

export default function App() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [path, setPath] = useState(location.pathname);
  const [menu, setMenu] = useState(false), [accountMenu, setAccountMenu] = useState(false);
  const [password, setPassword] = useState(false), [notice, setNotice] = useState('');
  const accountRef = useRef();
  function go(next, message = '') {
    history.pushState({}, '', next); setPath(next); setMenu(false); setAccountMenu(false); setNotice(message); window.scrollTo(0, 0);
  }
  useEffect(() => {
    const pop = () => {setPath(location.pathname); setMenu(false); setAccountMenu(false); setNotice('');};
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {api('/session').then(d => setUser(d.user)).catch(e => setError(e.message)).finally(() => setReady(true));}, []);
  useEffect(() => {
    const expired = () => {setUser(null); go('/login');};
    window.addEventListener('black-session-expired', expired); return () => window.removeEventListener('black-session-expired', expired);
  }, []);
  useEffect(() => {
    const close = e => {if (!accountRef.current?.contains(e.target)) setAccountMenu(false);};
    const escape = e => {if (e.key === 'Escape') {setAccountMenu(false); setMenu(false);}};
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape);};
  }, []);
  if (!ready) return <Loading/>;
  if (!user) return <Login error={error} onLogin={u => {setUser(u); go('/dashboard');}}/>;
  async function logout() {
    try {await api('/logout', {method: 'POST', body: {}}); setUser(null); go('/login');} catch (e) {setNotice(e.message);}
  }
  const page = path === '/new' ? <PersonForm go={go}/> : path.startsWith('/people/') ? <PersonForm id={decodeURIComponent(path.split('/')[2])} go={go}/> : path === '/people' ? <People user={user} go={go}/> : path === '/compare' || path === '/bulk' ? <Roster key={path} mode={path.slice(1)} go={go}/> : path === '/audit' && user.role === 'ADMIN' ? <Audit/> : path === '/users' && user.role === 'ADMIN' ? <Accounts user={user}/> : <Dashboard go={go}/>;
  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div className="header-content">
      <a href="/dashboard" className="brand" aria-label="BLACK 홈" onClick={e => {e.preventDefault(); go('/dashboard');}}><span className="brand-symbol" aria-hidden="true">B</span><span>BLACK</span></a>
      <button className="icon-button mobile-menu" aria-label={menu ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menu} aria-controls="primary-navigation" onClick={() => setMenu(!menu)}>{menu ? <X size={20}/> : <Menu size={20}/>}</button>
      <nav id="primary-navigation" className={'main-navigation ' + (menu ? 'open' : '')} aria-label="주 메뉴">
        {navigation.map(([url, label]) => {const active = path === url || (url === '/people' && path.startsWith('/people/')); return <a key={url} href={url} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={e => {e.preventDefault(); go(url);}}>{label}</a>;})}
      </nav>
      <div className="header-account" ref={accountRef}>
        <button className="account-toggle" aria-label="계정 메뉴" aria-expanded={accountMenu} onClick={() => setAccountMenu(!accountMenu)}><span className="avatar" aria-hidden="true">{user.name.slice(0, 1)}</span><span className="account-name">{user.name}</span></button>
        <button className="logout" onClick={logout}>로그아웃</button>
        {accountMenu && <div className="account-dropdown"><div className="account-caption">{user.role === 'ADMIN' ? '관리자' : '직원'} 계정</div><button onClick={() => {setPassword(true); setAccountMenu(false);}}>비밀번호 변경</button>{user.role === 'ADMIN' && <><a href="/users" onClick={e => {e.preventDefault(); go('/users');}}>직원 계정</a><a href="/audit" onClick={e => {e.preventDefault(); go('/audit');}}>활동 기록</a></>}</div>}
      </div>
    </div></div></header>
    <main id="main-content"><div className="content-frame"><Alert success>{notice}</Alert>{page}</div></main>
    <footer className="app-footer"><div>BLACK · 내부 업무용 · 외부 공유 금지 · 주요 접근과 변경 작업은 감사 로그에 기록됩니다.</div></footer>
    {password && <PasswordModal close={() => setPassword(false)} changed={() => {setPassword(false); setUser(null); go('/login');}}/>}
  </div>;
}

function PasswordModal({close, changed}) {
  const [values, setValues] = useState({currentPassword: '', newPassword: ''}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {e.preventDefault(); setBusy(true); try {await api('/password', {method: 'POST', body: values}); changed();} catch (e) {setError(e.message);} finally {setBusy(false);}}
  return <Modal title="비밀번호 변경" onClose={close}><form onSubmit={submit}><Alert>{error}</Alert><Field label="현재 비밀번호"><input type="password" autoComplete="current-password" required value={values.currentPassword} onChange={e => setValues({...values, currentPassword: e.target.value})}/></Field><Field label="새 비밀번호" hint="12자 이상으로 설정하세요. 변경 후 다시 로그인합니다."><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={values.newPassword} onChange={e => setValues({...values, newPassword: e.target.value})}/></Field><div className="form-actions"><button type="button" className="button" onClick={close}>취소</button><button className="button primary" disabled={busy}>비밀번호 변경</button></div></form></Modal>;
}
