let csrfToken='';
export async function api(path,{method='GET',body}={}) {
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(data.csrfToken) csrfToken=data.csrfToken;
  if(!response.ok) {if(response.status===401&&path!=='/login')window.dispatchEvent(new Event('black-session-expired'));const error=new Error(data.error||'요청에 실패했습니다.');error.status=response.status;throw error;}
  return data;
}
