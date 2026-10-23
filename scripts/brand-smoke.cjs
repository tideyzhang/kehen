const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {app,BrowserWindow,dialog}=require('electron');
dialog.showMessageBox=async()=>({response:1});
dialog.showErrorBox=(title,message)=>{console.error(title,message);app.exit(1);};
setTimeout(()=>{console.error('Brand check timed out');app.exit(1);},20000);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kehen-brand-upgrade-')),legacy=path.join(temp,'classroom-points');
fs.mkdirSync(legacy);fs.copyFileSync(path.join(__dirname,'../test/fixtures/v0.5.0.db'),path.join(legacy,'classroom.db'));
app.setPath('appData',temp);delete process.env.CLASSROOM_TEST_DIR;
let started=false;const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.on('browser-window-created',(_,floating)=>floating.webContents.once('did-finish-load',async()=>{
 if(started)return;started=true;
 try{
  await wait(500);const fj=s=>floating.webContents.executeJavaScript(s);
  assert.equal(app.getName(),'课痕');assert.equal(app.getPath('userData'),legacy);assert.equal(app.getPath('sessionData'),legacy);assert.equal(floating.getTitle(),'课痕');
  const before=await fj("(async()=>({students:F.data.students.map(s=>s.id),records:F.records.map(r=>r.id),events:(await call('events',{classId:F.classId})).map(r=>r.id)}))()");
  assert.equal(before.students.length,2);assert.equal(before.records.length,3);assert.equal(before.events.length,1);
  await fj("call('openManager',{view:'settings',classId:F.classId})");await wait(450);
  const manager=BrowserWindow.getAllWindows().find(w=>w!==floating),mj=s=>manager.webContents.executeJavaScript(s);
  assert.equal(manager.getTitle(),'课痕');assert.equal(await mj('document.title'),'课痕');assert.equal(await mj("document.querySelector('.brand-title').textContent"),'课痕 · 管理');
  assert.equal(await mj("(async()=>{const img=document.querySelector('.brand-title img');await img.decode();return img.naturalWidth===48&&img.getBoundingClientRect().height===28})()"),true);
  const backup=path.join(temp,'export.db');dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});await mj("call('backup')");assert.ok(fs.existsSync(backup));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backup]});assert.equal(await mj("call('restore')"),true);
  await fj('refresh()');const after=await fj("(async()=>({students:F.data.students.map(s=>s.id),records:F.records.map(r=>r.id),events:(await call('events',{classId:F.classId})).map(r=>r.id)}))()");assert.deepEqual(after,before);
  assert.equal(fs.existsSync(path.join(temp,'课痕')),false,'rename must not create a separate empty database');
  console.log('BRAND_UPGRADE_OK: app/window names, header icon, legacy data directory, student/score/event identities, full backup/restore');
  for(const win of BrowserWindow.getAllWindows())win.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(0);
 }catch(error){console.error(error);for(const win of BrowserWindow.getAllWindows())win.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(1);}
}));require('../src/main.cjs');
