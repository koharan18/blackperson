import {spawn} from 'node:child_process';
const api=spawn(process.execPath,['server/index.mjs'],{stdio:'inherit'});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'});
for(const s of ['SIGINT','SIGTERM']) process.once(s,()=>{api.kill('SIGTERM');vite.kill('SIGTERM');});
for(const child of [api,vite]) child.once('exit',code=>{api.kill('SIGTERM');vite.kill('SIGTERM');process.exitCode=code||0;});
