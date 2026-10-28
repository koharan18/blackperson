import React, {useEffect,useRef,useState,useId} from 'react';
import {AlertCircle,ArrowLeft,ArrowRight,Inbox,LoaderCircle,X,CheckCircle2} from 'lucide-react';
import {api} from './api.mjs';

export const dateText=v=>v?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(v)):'—';
export const dateInput=v=>v?new Date(v).toISOString().slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
export function useData(path,refresh=0) {
  const [state,set]=useState({data:null,error:'',loading:true});
  useEffect(()=>{let active=true;set(s=>({...s,loading:true,error:''}));api(path).then(data=>{if(active)set({data,error:'',loading:false});}).catch(e=>{if(active)set({data:null,error:e.message,loading:false});});return()=>{active=false;};},[path,refresh]);
  return state;
}
export function Heading({eyebrow='BLACK CONSOLE',title,description,children}) {return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="heading-actions">{children}</div></div>;}
export function Alert({children,success=false}) {if(!children)return null;return <div className={'alert '+(success?'success':'')} role={success?'status':'alert'}>{success?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<span>{children}</span></div>;}
export function Loading() {return <div className="loading" role="status"><LoaderCircle className="spin" size={22}/>불러오는 중입니다</div>;}
export function Empty({title='등록된 내역이 없습니다',description='새로운 대상자를 등록하면 이곳에서 확인할 수 있습니다.'}) {return <div className="empty"><div className="empty-icon"><Inbox size={28}/></div><h3>{title}</h3><p>{description}</p></div>;}
export function Badge({children}) {return <span className={'badge '+(children==='일치'?'danger':children==='확인 필요'?'warning':children==='미등록'?'neutral':'green')}>{children}</span>;}
export function Field({label,required,children,hint}) {
  const id=useId();
  const attach=child=>{
    if(!React.isValidElement(child))return child;
    if(['input','select','textarea'].includes(child.type))return React.cloneElement(child,{id,'aria-describedby':hint?id+'-hint':undefined});
    return child.props.children?React.cloneElement(child,{},React.Children.map(child.props.children,attach)):child;
  };
  return <div className="field"><label htmlFor={id}>{label}{required&&<span className="required" aria-hidden="true"> *</span>}</label>{React.Children.map(children,attach)}{hint&&<small id={id+'-hint'}>{hint}</small>}</div>;
}
export function Pager({page,total,pageSize,onChange}) {const last=Math.max(1,Math.ceil(total/pageSize));return <div className="pager"><span>전체 <strong>{total.toLocaleString()}</strong>건 · {page} / {last} 페이지</span><div><button className="icon-button" aria-label="이전 페이지" disabled={page<=1} onClick={()=>onChange(page-1)}><ArrowLeft size={17}/></button><button className="icon-button" aria-label="다음 페이지" disabled={page>=last} onClick={()=>onChange(page+1)}><ArrowRight size={17}/></button></div></div>;}
export function Modal({title,onClose,children}) {
  const ref=useRef();
  useEffect(()=>{
    const previous=document.activeElement;ref.current?.focus();
    const key=e=>{
      if(e.key==='Escape')onClose();
      if(e.key==='Tab') {const els=[...ref.current.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}><div className="modal-title"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20}/></button></div>{children}</section></div>;
}
