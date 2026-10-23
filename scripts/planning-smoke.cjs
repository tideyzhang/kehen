const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {app,dialog}=require('electron');const Excel=require('exceljs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-plan-ui-'));process.env.CLASSROOM_TEST_DIR=temp;
const out=path.resolve(__dirname,'../output');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_,win)=>win.webContents.once('did-finish-load',async()=>{
  if(win.webContents.getURL().includes('floating.html')){await wait(500);await win.webContents.executeJavaScript("call('openManager',{view:'settings'})");return;}

  try{
    const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(s+'\n'+e.message);}};async function click(s){await js(`document.querySelector(${JSON.stringify(s)}).click()`);await wait(100);for(let i=0;i<100&&await js('state.busy');i++)await wait(100);assert.equal(await js('state.busy'),false);}
    await wait(600);await click('[data-action="demo"]');await click('[data-action="settings"]');await click('[data-action="timetable"]');await click('[data-action="addPeriod"]');
    await js(`planning.course.periods[0].start='00:00';planning.course.periods[0].end='23:59';planning.course.periods[0].subjects=Array(7).fill('生物');render();`);
    await click('[data-action="saveTimetable"]');assert.equal(await js('state.data.timetables[state.classId].periods.length'),1);
    await click('[data-action="followSchedule"]');await wait(1600);assert.equal(await js('active()?.subject'),'生物');assert.equal(await js('state.data.scheduleFollow'),await js('state.classId'));const followed=await js('state.classId');await js(`(async()=>{const other=await call('class',{name:'其他班'});await refresh();const select=document.querySelector('#classSelect');select.value=other;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(200);assert.equal(await js('state.data.scheduleFollow'),followed);await js(`state.classId=${JSON.stringify(followed)};refresh()`);
    await js(`(async()=>{const studentId=await call('draw');await call('score',{studentId,sessionId:active().id,value:2});await refresh();})()`);assert.equal(await js('state.records[0].amount'),200);
    await js(`call('end',{sessionId:active().id}).then(refresh)`);await wait(1500);assert.equal(await js('!!active()'),false);
    await click('[data-action="settings"]');await click('[data-action="timetable"]');await click('[data-action="followSchedule"]');
    const timetableFile=path.join(temp,'plan.xlsx');dialog.showSaveDialog=async()=>({canceled:false,filePath:timetableFile});
    await click('[data-action="scheduleExport"]');assert.ok(fs.existsSync(timetableFile));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[timetableFile]});
    await click('[data-action="scheduleImport"]');assert.equal(await js('planning.course.periods.length'),1);await click('[data-action="addOverride"]');await js(`planning.course.overrides[0].subject='数学';render();`);await click('[data-action="saveTimetable"]');
    fs.writeFileSync(path.join(out,'timetable.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-action="settings"]');await click('[data-tab="layout"]');await click('[data-action="seating"]');assert.equal(await js('Object.keys(planning.rules.students).length'),48);
    const baseline=await js('JSON.stringify(currentClass().layout)');
    await js(`const ids=students().map(s=>s.id);planning.rules.students[ids[0]].fixed=true;planning.rules.changeGroup=true;planning.rules.pairs=[[ids[1],ids[2]],[ids[2],ids[3]]];render();`);
    await click('[data-action="generateSeating"]');assert.equal(await js('!!planning.preview'),true);assert.equal(await js('JSON.stringify(currentClass().layout)'),baseline);
    assert.equal(await js('Object.values(planning.preview.layout).length'),48);assert.equal(await js('planning.preview.layout[Object.keys(currentClass().layout).find(k=>currentClass().layout[k]===students()[0].id)]===students()[0].id'),true);
    fs.writeFileSync(path.join(out,'seating-preview.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-action="applySeatingPreview"]');assert.equal(await js('planning.history.length'),2);assert.equal(await js('state.data.seatRules[state.classId].changeGroup'),true);assert.equal(await js('state.records[0].amount'),200);
    const csv=path.join(temp,'seats.csv');dialog.showSaveDialog=async()=>({canceled:false,filePath:csv});await click('[data-action="seatPanel:more"]');await click('[data-action="seatCSV"]');assert.ok(fs.readFileSync(csv,'utf8').startsWith('\ufeff'));
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[csv]});await click('[data-action="seatPanel:rotation"]');await click('[data-action="importPrevious"]');assert.deepEqual(await js('planning.previous'),await js('currentClass().layout'));
    await click('[data-action="generateSeating"]');assert.equal(await js('!!planning.preview'),true);await click('[data-action="cancelSeatPreview"]');
    await js(`planning.action('seatHistory:'+planning.history[0].id)`);await wait(200);await click('[data-action="applySeatingPreview"]');assert.equal(await js('JSON.stringify(currentClass().layout)'),baseline);
    await click('[data-action="settings"]');await click('[data-action="timetable"]');
    const actualFile=path.join(temp,'actual-course.xlsx'),actualBook=new Excel.Workbook();actualBook.addWorksheet('周课表').addRows(require('../test/fixtures/course-week.json'));await actualBook.xlsx.writeFile(actualFile);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[actualFile]});
    await click('[data-action="scheduleImport"]');assert.equal(await js('planning.course.periods.length'),14);assert.deepEqual(await js('planning.extraSubjects()'),['班主任','外语','自习','体育']);assert.equal(await js('currentClass().subjects.includes("外语")'),false);assert.equal(await js('document.querySelectorAll("[data-period]").length'),14);
    await js('document.querySelector(".schedule-table").scrollIntoView({block:"center"})');await wait(200);fs.writeFileSync(path.join(out,'course-import-preview.png'),(await win.webContents.capturePage()).toPNG());
    await click('[data-action="saveTimetable"]');assert.equal(await js('currentClass().subjects.includes("外语")'),true);assert.equal(await js('planning.extraSubjects().length'),0);
    await click('[data-tab="subjects"]');assert.equal(await js('!!document.querySelector("#subjectLibrary")'),true);assert.equal(await js('document.querySelectorAll("[data-seat-key]").length'),0);
    await click('[data-tab="layout"]');assert.equal(await js('document.querySelectorAll("[name=enabledSubject]").length'),0);await click('[data-action="seating"]');assert.equal(await js('state.view'), 'settings');
    console.log('PLANNING_UI_OK: auto start, score, manual end suppression, pause, timetable Excel preview, override, seat generation/apply/history, CSV roundtrip, points preserved');
    win.close();fs.rmSync(temp,{recursive:true,force:true});app.quit();
  }catch(e){console.error(e);fs.writeFileSync(path.join(out,'planning-error.png'),(await win.webContents.capturePage()).toPNG());win.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(1);}
}));
require('../src/main.cjs');
