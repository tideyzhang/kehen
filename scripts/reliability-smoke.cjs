const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {app,BrowserWindow,dialog}=require('electron'),Excel=require('exceljs'),{Store}=require('../src/store.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kehen-reliability-ui-'));
process.env.CLASSROOM_TEST_DIR=temp;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let started=false;
function finish(code){for(const win of BrowserWindow.getAllWindows())win.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(code);}
const timeout=setTimeout(()=>{console.error('Reliability UI timed out');finish(1);},30000);
dialog.showErrorBox=(title,message)=>{console.error(title,message);finish(1);};
app.on('browser-window-created',(_,floating)=>floating.webContents.once('did-finish-load',async()=>{
  if(started)return;started=true;
  try{
    await wait(400);await floating.webContents.executeJavaScript("call('openManager',{view:'settings'})");await wait(400);
    const manager=BrowserWindow.getAllWindows().find(win=>win!==floating),js=async code=>{try{return await manager.webContents.executeJavaScript(code);}catch(e){throw Error(code+'\n'+e.message);}};
    await js("call('demo');");await js('refresh()');
    await js("call('studentActive',{id:state.data.students[1].id,active:false})");await js('refresh()');
    const expected=await js('state.data.students.map(s=>({number:s.number,name:s.name,active:s.active}))');
    const file=path.join(temp,'roster.xlsx'),blank=path.join(temp,'blank.db'),backup=path.join(temp,'manual.db');
    dialog.showSaveDialog=async()=>({canceled:false,filePath:file});await js("call('exportRoster',{classId:state.classId})");
    const workbook=new Excel.Workbook();await workbook.xlsx.readFile(file);assert.equal(workbook.worksheets[0].getCell('D3').text,'停用');
    const empty=await Store.open(blank);empty.db.close();dialog.showOpenDialog=async()=>({canceled:false,filePaths:[blank]});dialog.showMessageBox=async()=>({response:1});
    await js("call('restore')");await js('refresh()');assert.equal(await js('state.data.students.length'),0);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
    await js("(async()=>{state.tab='roster';state.preview=await call('previewImport',{kind:'roster'});render()})()");
    assert.match(await js('document.body.innerText'),/新增 · 停用/);
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(200);
    fs.mkdirSync(path.resolve(__dirname,'../output'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../output/v074-roster-status-preview.png'),(await manager.webContents.capturePage()).toPNG());
    await js("document.querySelector('[data-action=commitImport]').click()");await wait(400);
    assert.deepEqual(await js('state.data.students.map(s=>({number:s.number,name:s.name,active:s.active}))'),expected);
    workbook.worksheets[0].getCell('D2').value='停用';await workbook.xlsx.writeFile(file);
    await js("(async()=>{state.preview=await call('previewImport',{kind:'roster',classId:state.classId});render()})()");
    assert.match(await js('document.body.innerText'),/停用 1 人/);
    await js("call('start',{classId:state.classId,subject:'语文'})");
    assert.match(await js("call('commitImport').then(()=>'',e=>e.message)"),/结束/);
    await js("call('end')");await js("call('commitImport')");await js('refresh()');assert.equal(await js('state.data.students[0].active'),0);
    workbook.worksheets[0].getCell('D2').value='未知';await workbook.xlsx.writeFile(file);
    await js("(async()=>{state.preview=await call('previewImport',{kind:'roster',classId:state.classId});render()})()");
    assert.match(await js('document.body.innerText'),/第2行.*状态/);
    assert.equal(await js("document.querySelector('[data-action=commitImport]').disabled"),true);
    dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});await js("call('backup')");
    const saved=new (await require('sql.js')()).Database(fs.readFileSync(backup));assert.equal(saved.exec('PRAGMA integrity_check')[0].values[0][0],'ok');assert.equal(saved.exec('PRAGMA foreign_key_check').length,0);saved.close();
    console.log('RELIABILITY_UI_OK: actual Excel roster export/reimport preserves all 48 numbers, names and states, preview, commit revalidation during class, invalid status rejection, manual backup integrity');
    clearTimeout(timeout);finish(0);
  }catch(error){console.error(error);clearTimeout(timeout);finish(1);}
}));
require('../src/main.cjs');
