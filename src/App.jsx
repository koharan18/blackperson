import React,{useEffect,useState} from 'react';
import {LayoutDashboard,Users,UserPlus,ScanSearch,Files,ShieldCheck,History,LogOut,Menu,X,ArrowUpRight,LockKeyhole,Eye,EyeOff,KeyRound,ChevronRight} from 'lucide-react';
import {api} from './api.mjs';
import {Alert,Field,Loading,Modal} from './components.jsx';
import {Dashboard,People,PersonForm,Audit,Accounts} from './pages.jsx';
import Roster from './roster-page.jsx';

const nav=[['/dashboard','대시보드',LayoutDashboard],['/people','대상자 목록',Users],['/new','신규 등록',UserPlus],['/compare','명단 확인',ScanSearch],['/bulk','일괄 등록',Files]];
export default function App() {
  const [user,setUser]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[path,setPath]=useState(location.pathname),[menu,setMenu]=useState(false),[password,setPassword]=useState(false),[notice,setNotice]=useState('');
  function go(next,message=''){history.pushState({},'',next);setPath(next);setMenu(false);setNotice(message);window.scrollTo(0,0);}
  useEffect(()=>{const pop=()=>{setPath(location.pathname);setMenu(false);setNotice('');};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{api('/session').then(d=>setUser(d.user)).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
  useEffect(()=>{const expired=()=>{setUser(null);go('/login');};window.addEventListener('black-session-expired',expired);return()=>window.removeEventListener('black-session-expired',expired);},[]);
  if(!ready)return <Loading/>;
  if(!user)return <Login error={error} onLogin={u=>{setUser(u);go('/dashboard');}}/>;
  const link=(url,label,Icon)=> <a key={url} href={url} className={'nav-item '+(path===url||(url==='/people'&&path.startsWith('/people/'))?'active':'')} onClick={e=>{e.preventDefault();go(url);}}><Icon size={19}/><span>{label}</span>{path===url&&<ChevronRight size={15} className="nav-arrow"/>}</a>;
  async function logout(){try{await api('/logout',{method:'POST',body:{}});setUser(null);go('/login');}catch(e){setNotice(e.message);}}
  const page=path==='/new'?<PersonForm go={go}/>:path.startsWith('/people/')?<PersonForm id={decodeURIComponent(path.split('/')[2])} go={go}/>:path==='/people'?<People user={user} go={go}/>:path==='/compare'||path==='/bulk'?<Roster key={path} mode={path.slice(1)} go={go}/>:path==='/audit'&&user.role==='ADMIN'?<Audit/>:path==='/users'&&user.role==='ADMIN'?<Accounts user={user}/>:<Dashboard go={go}/>;
  return <div className="app-shell">
    {menu&&<button className="sidebar-scrim" aria-label="메뉴 닫기" onClick={()=>setMenu(false)}/>}
    <aside className={'sidebar '+(menu?'open':'')}>
      <a href="/dashboard" className="brand" onClick={e=>{e.preventDefault();go('/dashboard');}}><span className="brand-symbol">B<span/></span><div>BLACK<small>INTERNAL MANAGEMENT</small></div></a>
      <div className="workspace-pill"><span className="status-dot"/> 제한 대상자 관리 시스템</div>
      <div className="nav-caption">WORKSPACE</div><nav aria-label="주 메뉴">{nav.map(x=>link(...x))}</nav>
      {user.role==='ADMIN'&&<><div className="nav-caption admin-caption">ADMINISTRATION</div><nav aria-label="관리자 메뉴">{link('/users','직원 계정',ShieldCheck)}{link('/audit','활동 기록',History)}</nav></>}
      <div className="sidebar-bottom"><div className="internal-note"><LockKeyhole size={15}/><span>내부 업무 전용<br/><small>개인정보를 안전하게 관리해 주세요.</small></span></div><div className="profile"><span className="avatar">{user.name.slice(0,1)}</span><div><strong>{user.name}</strong><small>{user.role==='ADMIN'?'관리자':'직원'}</small></div><button className="profile-action" title="비밀번호 변경" aria-label="비밀번호 변경" onClick={()=>{setPassword(true);setMenu(false);}}><KeyRound size={16}/></button></div><button className="logout" onClick={logout}><LogOut size={16}/>로그아웃</button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={()=>setMenu(!menu)}>{menu?<X size={22}/>:<Menu size={22}/>}</button><span>워크스페이스</span><ChevronRight size={14}/><strong>제한 대상자 관리</strong></div><div className="topbar-right"><span className="system-state"><span className="status-dot"/>시스템 연결됨</span><span className="topbar-divider"/><span>{user.name} 님</span></div></header>
    <main id="main-content"><Alert success>{notice}</Alert>{page}</main><footer className="app-footer"><span>BLACK · INTERNAL USE ONLY</span><span>안전한 기록, 정확한 확인.</span></footer></div>
    {password&&<PasswordModal close={()=>setPassword(false)} changed={()=>{setPassword(false);setUser(null);go('/login');}}/>}
  </div>;
}

function Login({onLogin,error:initialError}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(initialError);
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await api('/session');const data=await api('/login',{method:'POST',body:{email,password}});onLogin(data.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="login-page"><section className="login-brand-panel"><div className="login-brand"><span className="brand-symbol">B<span/></span> BLACK</div><div className="login-art"><div className="art-grid"/><div className="art-circle c1"/><div className="art-circle c2"/><div className="art-card"><ShieldCheck size={44}/><div><span>TRUSTED WORKSPACE</span><strong>기록은 안전하게.<br/>확인은 정확하게.</strong></div><div className="art-line"/><small>BLACK RESTRICTION MANAGEMENT</small></div></div><div className="login-brand-copy"><span className="eyebrow">ONE WORKSPACE. BETTER DECISIONS.</span><h2>함께 관리하고,<br/>더 정확하게 확인하세요.</h2><p>흩어진 제한 이력을 한곳에 모아<br/>일관된 업무 기준을 만들어 갑니다.</p></div><div className="login-brand-footer">BLACK <span>INTERNAL MANAGEMENT SYSTEM</span></div></section><section className="login-form-panel"><div className="login-form-wrap"><div className="login-lock"><LockKeyhole size={22}/></div><div className="eyebrow">STAFF ACCESS</div><h1>관리 콘솔에 오신 것을 환영합니다</h1><p className="login-description">직원 계정으로 로그인해 업무를 시작하세요.</p><Alert>{error}</Alert><form onSubmit={submit}><Field label="아이디"><input autoFocus required autoComplete="username" placeholder="직원 계정 이메일" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="비밀번호"><div className="password-input"><input required type={show?'text':'password'} autoComplete="current-password" placeholder="비밀번호를 입력하세요" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={show?'비밀번호 숨기기':'비밀번호 표시'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></Field><button className="button primary login-submit" disabled={busy}>{busy?'접속 중…':'관리 콘솔 접속'}<ArrowUpRight size={18}/></button></form><div className="login-help"><ShieldCheck size={18}/><span>허가된 직원만 이용할 수 있습니다.<br/>계정 문의는 내부 관리자에게 연락해 주세요.</span></div></div><div className="login-footer">공용 PC에서는 사용 후 반드시 로그아웃해 주세요.</div></section></div>;
}

function PasswordModal({close,changed}) {
  const [values,setValues]=useState({currentPassword:'',newPassword:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);try{await api('/password',{method:'POST',body:values});changed();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="비밀번호 변경" onClose={close}><form onSubmit={submit}><Alert>{error}</Alert><Field label="현재 비밀번호"><input type="password" autoComplete="current-password" required value={values.currentPassword} onChange={e=>setValues({...values,currentPassword:e.target.value})}/></Field><Field label="새 비밀번호" hint="12자 이상으로 설정하세요. 변경 후 다시 로그인합니다."><input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={values.newPassword} onChange={e=>setValues({...values,newPassword:e.target.value})}/></Field><div className="form-actions"><button type="button" className="button" onClick={close}>취소</button><button className="button primary" disabled={busy}>비밀번호 변경</button></div></form></Modal>;
}
