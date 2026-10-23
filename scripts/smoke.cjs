const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,dialog}=require('electron');const assert=require('node:assert/strict');const Excel=require('exceljs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-ui-'));process.env.CLASSROOM_TEST_DIR=temp;
const output=path.resolve(__dirname,'../output');fs.mkdirSync(output,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_,win)=>{
  win.webContents.on('console-message',(_,level,message)=>console.log('RENDERER',level,message));
  win.webContents.on('preload-error',(_,p,e)=>console.error('PRELOAD',p,e));
  win.webContents.once('did-finish-load',async()=>{
    if(win.webContents.getURL().includes('floating.html')){await wait(500);await win.webContents.executeJavaScript("call('openManager',{view:'settings'})");return;}

    try{
      const js=code=>win.webContents.executeJavaScript(code);
      async function click(selector){await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait(350);}
      await wait(500);if(process.platform==='darwin')assert.equal(app.dock.isVisible(),true,'Dock图标应可见');
      await click('[data-action="demo"]');
      assert.match(await js('document.body.innerText'),/演示班/);
      await click('[data-action="settings"]');await click('[data-tab="layout"]');
      assert.equal(await js("document.querySelector('[data-seat-key]').dataset.seatKey"),'7,0');
      assert.equal(await js("document.querySelector('.stage').getBoundingClientRect().top>=document.querySelector('.editor').getBoundingClientRect().bottom"),true);
      assert.equal(await js('document.querySelectorAll("[data-seat-key]").length'),64);
      await js('document.querySelector("#rows").value="7"');await click('[data-action="dimensions"]');
      assert.equal(await js('document.querySelectorAll("[data-seat-key]").length'),56);
      assert.equal(await js('Object.values(state.layoutDraft.layout).length'),48);
      await click('[data-action="saveLayout"]');
      fs.writeFileSync(path.join(output,'settings.png'),(await win.webContents.capturePage()).toPNG());
      const importFile=path.join(temp,'external.xlsx'),exportFile=path.join(temp,'export.xlsx');
      const workbook=new Excel.Workbook(),sheet=workbook.addWorksheet('积分');sheet.addRow(['班级','学号','姓名','日期','分值','类别','科目','备注']);sheet.addRow(['演示班','01','示例学生1','2026-09-12',1.25,'作业','生物','测试']);await workbook.xlsx.writeFile(importFile);
      const saveNames=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[importFile]});dialog.showSaveDialog=async(_owner,options)=>{saveNames.push(options.defaultPath);return {canceled:false,filePath:exportFile};};
      await click('[data-action="seatTemplate"]');const seatsTemplate=new Excel.Workbook();await seatsTemplate.xlsx.readFile(exportFile);assert.equal(seatsTemplate.getWorksheet('座位表').rowCount,7);assert.equal(seatsTemplate.worksheets.length,3);
      await click('[data-tab="scores"]');
      while(await js('document.querySelectorAll(".score-input").length')>1){const i=await js('document.querySelectorAll(".score-input").length-1');await click(`[data-remove-score="${i}"]`);}
      await click('[data-action="saveSettings"]');assert.equal(await js('state.data.scores.length'),1);
      await click('[data-tab="import"]');await click('[data-import="points"]');
      assert.match(await js('document.body.innerText'),/将新增 1 笔积分/);assert.match(await js('document.body.innerText'),/作业/);assert.match(await js('document.body.innerText'),/测试/);await click('[data-action="commitImport"]');
      assert.equal(await js('state.records.filter(r=>r.batch_id&&!r.reversal_of).length'),1);
      await js('call("export",{filter:{classId:state.classId}})');
      const exported=new Excel.Workbook();await exported.xlsx.readFile(exportFile);assert.equal(exported.worksheets[0].rowCount,2);
      await js('call("template",{kind:"roster"})');const template=new Excel.Workbook();await template.xlsx.readFile(exportFile);assert.equal(template.worksheets[0].getCell('B1').text,'学号');
      await js('call("backup")');assert.equal(fs.readFileSync(exportFile).subarray(0,15).toString(),'SQLite format 3');
      for(const [action,extra] of [['template',{kind:'points'}],['exportRoster',{}],['exportEvents',{filter:{}}],['exportSummary',{rows:[]}],['seatRulesExport',{}],['scheduleExport',{}],['seatCSV',{}]])await js(`call(${JSON.stringify(action)},{classId:state.classId,...${JSON.stringify(extra)}})`);
      assert.equal(saveNames.length,11);for(const name of saveNames){assert.match(name,/-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.(xlsx|csv|db)$/);assert.equal(/[<>:"/\\|?*]/.test(name),false);}
      const originals=fs.readFileSync(importFile),importedLabel=await js('call("previewImport",{kind:"points"}).then(result=>result.label)');assert.deepEqual(fs.readFileSync(importFile),originals);assert.equal(importedLabel,path.basename(importFile));
      console.log('IO_SMOKE_OK: Excel preview, commit, export, template and SQLite backup, timestamped names for all 11 export/template paths, unchanged import source');
      win.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(0);
    }catch(e){console.error(e);fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());win.close();app.exit(1);}
  });
});
require('../src/main.cjs');
