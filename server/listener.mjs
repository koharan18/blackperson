import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {root} from './runtime.mjs';

export function createListener(app,config) {
  const host=config.BLACK_BIND_HOST||'127.0.0.1';
  if(config.BLACK_HTTPS!=='true' && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('사내망 공개는 HTTPS 설정 후 가능합니다. README의 Windows HTTPS 절차를 확인해 주세요.');
  if(config.BLACK_HTTPS==='true') {
    const {password}=JSON.parse(readFileSync(join(root,'private','tls.json'),'utf8').replace(/^\uFEFF/,''));
    return https.createServer({pfx:readFileSync(join(root,'private','tls.pfx')),passphrase:password,minVersion:'TLSv1.2'},app);
  }
  return http.createServer(app);
}
