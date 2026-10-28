import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {applyDesignUpdate} from '../scripts/apply-design-update.mjs';

function fixture() {
  const root=mkdtempSync(join(tmpdir(),'black-ui-update-'));
  const bundle=join(root,'bundle'),target=join(root,'existing-app');
  for(const p of ['bundle/dist/assets','bundle/src','existing-app/dist/assets','existing-app/src','existing-app/server','existing-app/data','existing-app/private'])mkdirSync(join(root,p),{recursive:true});
  const files={'dist/assets/new.js':'new-ui','dist/index.html':'new-index','src/App.jsx':'new-source'};
  for(const [path,text] of Object.entries(files))writeFileSync(join(bundle,path),text);
  writeFileSync(join(bundle,'update-manifest.json'),JSON.stringify({format:'BLACK-UI-UPDATE-1',files:Object.fromEntries(Object.entries(files).map(([path,text])=>[path,createHash('sha256').update(text).digest('hex')]))}));
  writeFileSync(join(target,'package.json'),JSON.stringify({name:'black-recovery'}));
  for(const [path,text] of Object.entries({'server/index.mjs':'server-original','dist/index.html':'old-index','dist/assets/old.js':'retained-old-asset','src/App.jsx':'old-source','data/marker':'existing database','private/BLACK.env.backup':'private key material'}))writeFileSync(join(target,path),text);
  return {root,bundle,target};
}

test('UI updater preserves DB, secrets, backend and old assets and backs up changed UI',()=>{
  const f=fixture();try {
    const result=applyDesignUpdate(f.bundle,f.target);
    assert.equal(result.updated,3);
    assert.equal(readFileSync(join(f.target,'dist/index.html'),'utf8'),'new-index');
    assert.equal(readFileSync(join(f.target,'dist/assets/old.js'),'utf8'),'retained-old-asset');
    assert.equal(readFileSync(join(f.target,'data/marker'),'utf8'),'existing database');
    assert.equal(readFileSync(join(f.target,'private/BLACK.env.backup'),'utf8'),'private key material');
    assert.equal(readFileSync(join(f.target,'server/index.mjs'),'utf8'),'server-original');
    assert.equal(readFileSync(join(result.backup,'dist/index.html'),'utf8'),'old-index');
    assert.equal(readFileSync(join(result.backup,'src/App.jsx'),'utf8'),'old-source');
    assert.equal(applyDesignUpdate(f.bundle,f.target).updated,0);
    assert.equal(readdirSync(join(f.target,'.ui-backups')).length,1);
  }finally {rmSync(f.root,{recursive:true,force:true});}
});

test('corrupt update or a path outside the UI is rejected before any file changes',()=>{
  const f=fixture();try {
    writeFileSync(join(f.bundle,'dist/assets/new.js'),'corrupted');
    assert.throws(()=>applyDesignUpdate(f.bundle,f.target),/검증/);
    assert.equal(readFileSync(join(f.target,'dist/index.html'),'utf8'),'old-index');
    assert.equal(existsSync(join(f.target,'.ui-backups')),false);
    writeFileSync(join(f.bundle,'update-manifest.json'),JSON.stringify({format:'BLACK-UI-UPDATE-1',files:{'../private/BLACK.env.backup':'a'.repeat(64),'dist/index.html':createHash('sha256').update('new-index').digest('hex')}}));
    assert.throws(()=>applyDesignUpdate(f.bundle,f.target),/경로/);
    assert.equal(readFileSync(join(f.target,'private/BLACK.env.backup'),'utf8'),'private key material');
  }finally {rmSync(f.root,{recursive:true,force:true});}
});
