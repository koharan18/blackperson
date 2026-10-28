import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5173,proxy:{'/api':'http://127.0.0.1:8234'}},build:{chunkSizeWarningLimit:1200}});
