import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';
const launchOptions=process.platform==='linux'?{executablePath:await chromium.executablePath(),args:chromium.args.filter(arg=>arg!=='--single-process'),env:{...process.env,XDG_CACHE_HOME:'/workspace/.cache'}}:{};
export default defineConfig({testDir:'tests',testMatch:'ui.spec.mjs',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:8235',headless:true,launchOptions},webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:8235/api/session',reuseExistingServer:false,timeout:60000}});
