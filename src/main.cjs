const {app,BrowserWindow,ipcMain,dialog,screen,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto');
const {exportName}=require('./export-name.cjs');
const Excel=require('exceljs');const {Store,day}=require('./store.cjs');
const {createSeatWorkbook,parseSeatWorkbook,previewSeatRoster}=require('./seat-excel.cjs');
const seating=require('./seating.cjs');const {createRulesWorkbook,parseRulesPreview}=require('./seat-rules-excel.cjs');const {scheduleWorkbook,parseSchedule}=require('./planning-io.cjs');
const {TOP_LEVEL,applyTop,fixTop,shouldKeep}=require('./window-top.cjs');
let seatPreview,rosterPreview,nameImport;
let scheduleTimer;
let store,win,manager,pending,windowPrefs={},prefsFile,quitting=false;
let pinned=true;
const testing=process.env.CLASSROOM_TEST_DIR;
let dataPathError;
try{require('./portable.cjs').configureDataPath(app,{testDirectory:testing});}catch(error){dataPathError=error;}
app.setName('课痕');
if(process.platform==='win32')app.setAppUserModelId('local.classroom.points');
if(!app.requestSingleInstanceLock())app.quit();
app.on('activate',()=>{if(win&&!win.isDestroyed()){win.show();win.focus();}});
app.on('second-instance',()=>{win?.show();win?.focus();applyTop(win,pinned);});
async function confirmSeatExport(people,owner){const duplicates=[...new Set(people.filter(s=>people.some(o=>o.id!==s.id&&(o.seatName||o.name)===(s.seatName||s.name))).map(s=>s.seatName||s.name))];if(!duplicates.length)return true;const answer=await dialog.showMessageBox(owner,{type:'warning',buttons:['继续导出','取消'],defaultId:1,cancelId:1,message:'座位文件中存在重名',detail:duplicates.join('、')+'。继续导出后，再导入时需要逐项核对；也可先在本轮人员中设置座位显示名。'});return answer.response===0;}
function finishNameImport(){try{const result=nameImport.parse(nameImport.choices);nameImport=null;return result;}catch(e){if(!e.nameConflict){nameImport=null;throw e;}return {nameConflict:e.nameConflict,token:nameImport.token};}}
async function workbookRows(file){
  const wb=new Excel.Workbook();await wb.xlsx.readFile(file);const sheet=wb.worksheets[0];if(!sheet)throw Error('工作簿没有工作表');
  const headers=[];sheet.getRow(1).eachCell((c,i)=>headers[i]=c.text.trim());
  const rows=[];sheet.eachRow((r,index)=>{if(index===1)return;const row={};headers.forEach((h,i)=>{if(!h)return;const c=r.getCell(i);row[h]=c.value instanceof Date?day(c.value):c.text;});if(Object.values(row).some(Boolean))rows.push(row);});return rows;
}
async function writeExcel(title,headers,rows,owner=win){
  const choice=await dialog.showSaveDialog(owner,{title,defaultPath:exportName(title,'xlsx'),filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});if(choice.canceled)return;
  const wb=new Excel.Workbook(),ws=wb.addWorksheet(title.slice(0,31));ws.columns=headers.map(h=>({header:h,key:h,width:h==='备注'?32:18}));rows.forEach(r=>ws.addRow(r));
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF286458'}};ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:{row:Math.max(1,ws.rowCount),column:headers.length}};await wb.xlsx.writeFile(choice.filePath);return choice.filePath;
}
async function handle(action,p={},owner=win){
  if(action==='openManager'){await openManager(p);return;}
  if(action==='showFloating'){manager?.hide();win.show();win.focus();return;}
  if(action==='quit'){app.quit();return;}
  if(action==='floatResize'){if(owner!==win)return;resizeFloating(p);return;}
  if(action==='resolveSeatNames'){
    if(!nameImport||p.token!==nameImport.token)throw Error('姓名核对已失效，请重新导入');
    if(nameImport.fingerprint!==JSON.stringify(store.snapshot()))throw Error('数据已改变，请重新导入');
    nameImport.choices[p.where]=p.id;return finishNameImport();
  }
  if(action==='snapshot')return {...store.snapshot(),pinned};
  if(['seatRulesExport','seatRulesImport','scheduleExport','scheduleImport','seatingData','checkSeating','generateSeating','applySeatingPreview','previewSeatHistory','seatCSV'].includes(action)){
    const snap=store.snapshot(),c=snap.classes.find(c=>c.id===p.classId);if(!c)throw Error('请选择班级');
    const people=snap.students.filter(s=>s.class_id===c.id).map(s=>({...s,seatName:snap.seatNames[s.id]}));
    const fingerprint=JSON.stringify([c,people,snap.seatRules[c.id]]);
    if(action==='seatRulesExport'){
      if(!await confirmSeatExport(people.filter(s=>!s.deleted_at),owner))return;
      const choice=await dialog.showSaveDialog(owner,{defaultPath:exportName(`${c.name}-排座规则`,'xlsx'),filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});if(choice.canceled)return;
      await createRulesWorkbook(c,people,p.rules||snap.seatRules[c.id]||seating.defaults(c,people)).xlsx.writeFile(choice.filePath);return true;
    }
    if(action==='seatRulesImport'){
      const choice=await dialog.showOpenDialog(owner,{filters:[{name:'Excel 排座规则',extensions:['xlsx']}],properties:['openFile']});if(choice.canceled)return;
      const wb=new Excel.Workbook();await wb.xlsx.readFile(choice.filePaths[0]);nameImport={token:crypto.randomUUID(),choices:{},fingerprint:JSON.stringify(store.snapshot()),parse:choices=>parseRulesPreview(wb,c,people,p.rules||snap.seatRules[c.id]||seating.defaults(c,people),choices)};return finishNameImport();
    }

    if(action==='seatingData')return {rules:snap.seatRules[c.id]||seating.defaults(c,people),history:snap.seatHistory[c.id]||[]};
    if(['checkSeating','generateSeating'].includes(action)){
      const runtime=structuredClone(p.rules);for(const id of p.excludedIds||[]){runtime.students[id]||={};runtime.students[id].excluded=true;}
      if(action==='checkSeating')return seating.preflight(c,people,runtime,p.previous||c.layout);
      const result=seating.generate(c,people,runtime,p.previous||c.layout);seatPreview={classId:c.id,fingerprint,rows:c.rows,cols:c.cols,layout:result.layout,rules:seating.validate(c,people,p.rules,{checkCapacity:false})};return result;
    }
    if(action==='previewSeatHistory'){
      const entry=(snap.seatHistory[c.id]||[]).find(h=>h.id===p.id);if(!entry)throw Error('历史版本不存在');seatPreview={...entry,classId:c.id,fingerprint};return entry;
    }
    if(action==='applySeatingPreview'){
      if(!seatPreview||seatPreview.classId!==c.id||seatPreview.fingerprint!==fingerprint)throw Error('预览已失效，名单、规则或座位发生变化，请重新生成');
      store.command('applySeating',{...seatPreview,subjects:c.subjects});seatPreview=null;return true;
    }
    if(action==='scheduleExport'){
      const choice=await dialog.showSaveDialog(owner,{defaultPath:exportName(`${c.name}-课程表`,'xlsx'),filters:[{name:'Excel',extensions:['xlsx']}]});if(choice.canceled)return;
      await scheduleWorkbook(snap.timetables[c.id]||{periods:[],overrides:[]}).xlsx.writeFile(choice.filePath);return true;
    }
    if(action==='scheduleImport'){
      const choice=await dialog.showOpenDialog(owner,{filters:[{name:'Excel',extensions:['xlsx']}],properties:['openFile']});if(choice.canceled)return;
      const wb=new Excel.Workbook();await wb.xlsx.readFile(choice.filePaths[0]);return parseSchedule(wb,c.subjects,{allowNewSubjects:true});
    }
    if(action==='seatCSV'){
      if(!await confirmSeatExport(people.filter(s=>s.active&&!s.deleted_at),owner))return;
      const choice=await dialog.showSaveDialog(owner,{defaultPath:exportName(`${c.name}-当前座位`,'csv'),filters:[{name:'CSV UTF-8',extensions:['csv']}]});if(choice.canceled)return;
      const byId=new Map(people.map(s=>[s.id,s.seatName||s.name]));const rows=Array.from({length:c.rows},(_,i)=>Array.from({length:c.cols},(_,j)=>{const v=c.layout[`${c.rows-1-i},${j}`];return '"'+String(v==='aisle'?'过道':byId.get(v)||'').replace(/"/g,'""')+'"';}).join(','));fs.writeFileSync(choice.filePath,'\ufeff'+rows.join('\r\n')+'\r\n');return true;
    }
  }

  if(action==='records')return store.records(p);
  if(action==='events')return store.events(p);
  if(action==='exportEvents')return writeExcel('课堂情况',['班级','学号','姓名','日期','科目','课节','情况','备注','分值','积分状态','记录时间','状态'],store.events(p.filter).map(r=>({'班级':r.class_name,'学号':r.number,'姓名':r.name,'日期':r.date,'科目':r.subject,'课节':r.lesson||(r.session_id?'关联课次':''),'情况':r.kind,'备注':r.note,'分值':r.score_amount===null?'':r.score_amount/100,'积分状态':r.point_id?(r.score_reversed?'已撤销':'有效'):'不计分','记录时间':r.created,'状态':r.voided_at?'已撤销':'有效'})),owner);
  if(action==='resize')return;
  if(action==='pin'){pinned=!!p.value;applyTop(win,pinned);applyTop(manager,pinned);return true;}
  if(action==='fixTop'){pinned=true;applyTop(manager,true);return fixTop(win);}
  if(action==='minimize'){owner.minimize();return;}
  if(action==='close'){owner.close();return;}
  if(action==='previewImport'){
    const choice=await dialog.showOpenDialog(owner,{filters:[{name:'Excel 工作簿',extensions:['xlsx']}],properties:['openFile']});if(choice.canceled)return null;
    const file=choice.filePaths[0],rows=await workbookRows(file),hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    pending={kind:p.kind,rows,hash,label:path.basename(file),classId:p.classId||null};return {...store.preview(p.kind,rows,hash,pending.classId,true),label:pending.label};
  }
  if(action==='commitImport'){if(!pending)throw Error('请先预览导入');const n=store.importRows(pending.kind,pending.rows,pending.hash,pending.label,!!p.allowDuplicate,pending.classId,true);pending=null;return n;}
  if(action==='template'){
    const headers=p.kind==='roster'?(p.classId?['学号','姓名']:['班级','学号','姓名']):['学号','姓名','日期','分值','类别','科目','备注'];
    return writeExcel(p.kind==='roster'?'学生名单模板':'外部积分模板',headers,[],owner);
  }
  if(action==='exportRoster'){
    const snap=store.snapshot(),c=snap.classes.find(c=>c.id===p.classId);if(!c)throw Error('请先设置班级');
    const exported=new Date().toLocaleString('zh-CN'),rows=snap.students.filter(s=>s.class_id===c.id&&!s.deleted_at).map(s=>({'班级':c.name,'学号':s.number,'姓名':s.name,'状态':s.active?'在班':'停用','导出时间':exported}));
    return writeExcel(`${c.name}-当前名单`,['班级','学号','姓名','状态','导出时间'],rows,owner);
  }
  if(action==='seatTemplate'){
    const snap=store.snapshot(),c=snap.classes.find(c=>c.id===p.classId);if(!c)throw Error('请选择班级');
    const students=snap.students.filter(s=>s.class_id===c.id&&s.active).map(s=>({...s,seatName:snap.seatNames[s.id]}));if(!students.length)throw Error('请先导入本班学生名单');
    if(!await confirmSeatExport(students,owner))return;
    const choice=await dialog.showSaveDialog(owner,{title:'下载本班座位模板',defaultPath:exportName(`${c.name}-座位模板`,'xlsx'),filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});if(choice.canceled)return;
    await createSeatWorkbook(c,students).xlsx.writeFile(choice.filePath);return choice.filePath;
  }
  if(action==='commitSeatRoster'){if(!rosterPreview||rosterPreview.token!==p.token)throw Error('导入预览已失效，请重新导入');const result=store.command('syncSeatRoster',{...rosterPreview,syncRoster:p.syncRoster!==false});rosterPreview=null;return result;}
  if(action==='seatImport'){
    const c=store.snapshot().classes.find(c=>c.id===p.classId);if(!c)throw Error('请选择班级');
    const choice=await dialog.showOpenDialog(owner,{filters:[{name:'座位表 Excel / CSV',extensions:['xlsx','csv']}],properties:['openFile']});if(choice.canceled)return null;
    const wb=new Excel.Workbook();if(path.extname(choice.filePaths[0]).toLowerCase()==='.csv')await wb.csv.readFile(choice.filePaths[0],{map:v=>String(v).replace(/^\ufeff/,'')});else await wb.xlsx.readFile(choice.filePaths[0]);
    const snap=store.snapshot(),students=snap.students.filter(s=>s.class_id===c.id).map(s=>({...s,seatName:snap.seatNames[s.id]}));
    nameImport={token:crypto.randomUUID(),choices:{},fingerprint:JSON.stringify(snap),parse:choices=>{
      if(p.syncRoster){rosterPreview={...previewSeatRoster(wb,students,choices),classId:c.id,token:crypto.randomUUID(),fingerprint:JSON.stringify([store.one('SELECT * FROM classes WHERE id=?',[c.id]),store.all('SELECT * FROM students WHERE class_id=?',[c.id])])};return rosterPreview;}
      return parseSeatWorkbook(wb,students,choices);
    }};return finishNameImport();
  }
  if(action==='export'){
    const rows=store.records(p.filter);return writeExcel('积分明细',['班级','学号','姓名','日期','科目','分值','类别','备注','记录编号','撤销原记录','导入批次'],rows.map(r=>({'班级':r.class_name,'学号':r.number,'姓名':r.name,'日期':r.date,'科目':r.subject||'非学科','分值':r.amount/100,'类别':r.category,'备注':r.note,'记录编号':r.id,'撤销原记录':r.reversal_of||'','导入批次':r.batch_id||''})),owner);
  }
  if(action==='exportSummary')return writeExcel('积分汇总',['班级','学号','姓名','加分','扣分','净积分','统计范围'],p.rows,owner);
  if(action==='backup'){
    const choice=await dialog.showSaveDialog(owner,{defaultPath:exportName('课痕备份','db'),filters:[{name:'课痕备份',extensions:['db']}]});if(choice.canceled)return;fs.writeFileSync(choice.filePath,store.exportBytes());return choice.filePath;
  }
  if(action==='restore'){
    if(store.active())throw Error('请先结束课堂再恢复备份');const choice=await dialog.showOpenDialog(owner,{filters:[{name:'课痕备份',extensions:['db']}],properties:['openFile']});if(choice.canceled)return;
    const answer=await dialog.showMessageBox(owner,{type:'warning',buttons:['取消','恢复备份'],defaultId:0,cancelId:0,message:'恢复将替换当前数据。当前数据会先自动备份。'});if(answer.response!==1)return;
    store.restore(fs.readFileSync(choice.filePaths[0]));return true;
  }
  if(action==='dataFolder'){await shell.openPath(path.dirname(store.file));return;}
  if(action==='demo'){
    if(store.snapshot().classes.length)throw Error('仅可在空数据库中载入演示名单');const rows=Array.from({length:48},(_,i)=>({'班级':'演示班','学号':String(i+1).padStart(2,'0'),'姓名':`示例学生${i+1}`}));store.importRows('roster',rows,'demo-roster','演示名单');const snap=store.snapshot(),c=snap.classes[0],layout={};snap.students.forEach((s,i)=>layout[`${7-Math.floor(i/8)},${i%8}`]=s.id);store.command('layout',{classId:c.id,rows:8,cols:8,layout,subjects:c.subjects});return;
  }
  return store.command(action,p);
}
function secureWindow(window){
  window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
}
function resizeFloating(p){
  const old=win.getBounds(),area=screen.getDisplayMatching(old).workArea;
  const width=Math.max(180,Math.min(Number(p.width)||184,area.width));
  const height=Math.max(64,Math.min(Number(p.height)||72,area.height));
  win.setBounds({width:Math.round(width),height:Math.round(height),x:Math.max(area.x,Math.min(old.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(old.y,area.y+area.height-height))});
}
async function openManager(p={}){
  const view=['events','summary','settings','backfill'].includes(p.view)?p.view:'settings';
  if(!manager||manager.isDestroyed()){
    const area=screen.getDisplayMatching(win.getBounds()).workArea;
    manager=new BrowserWindow({width:Math.min(1180,area.width),height:Math.min(880,area.height),minWidth:480,minHeight:420,title:'课痕 · 管理',icon:path.join(__dirname,'assets/brand/logo-256.png'),backgroundColor:'#f4f7f5',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    secureWindow(manager);
    manager.on('close',event=>{if(!quitting){event.preventDefault();manager.hide();win.show();}});
    await manager.loadFile(path.join(__dirname,'index.html'),{query:{view,classId:p.classId||''}});
  }else manager.webContents.send('navigate',{view,classId:p.classId||''});
  manager.show();win.hide();applyTop(manager,pinned);manager.focus();
}
function broadcast(channel,payload,except){for(const window of [win,manager])if(window&&!window.isDestroyed()&&window.webContents!==except)window.webContents.send(channel,payload);}
app.on('before-quit',()=>{quitting=true;});
app.whenReady().then(async()=>{
  if(dataPathError)throw dataPathError;
  if(process.platform==='darwin')app.setActivationPolicy('regular');
  store=await Store.open(path.join(app.getPath('userData'),'classroom.db'));
  prefsFile=path.join(app.getPath('userData'),'window.json');try{windowPrefs=JSON.parse(fs.readFileSync(prefsFile,'utf8'));}catch{}
  const saved=windowPrefs.launcher||{},area=screen.getPrimaryDisplay().workArea;
  const x=Number.isFinite(saved.x)?Math.max(area.x,Math.min(saved.x,area.x+area.width-184)):area.x+area.width-204;
  const y=Number.isFinite(saved.y)?Math.max(area.y,Math.min(saved.y,area.y+area.height-72)):area.y+80;
  win=new BrowserWindow({width:184,height:72,x,y,minWidth:180,minHeight:64,frame:false,resizable:false,title:'课痕',icon:path.join(__dirname,'assets/brand/logo-256.png'),alwaysOnTop:true,backgroundColor:'#0d6b63',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.on('close',()=>{windowPrefs.launcher=win.getBounds();try{fs.writeFileSync(prefsFile,JSON.stringify(windowPrefs));}catch{}if(!quitting)app.quit();});
  secureWindow(win);win.on('show',()=>applyTop(win,pinned));
  applyTop(win,pinned);try{win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});}catch{}
  if(process.platform==='darwin'){app.dock.setIcon(path.join(__dirname,'assets/brand/logo-256.png'));await app.dock.show();}
  const changes=new Set(['seatNames','reviewLegacySeatRules','addStudent','deleteStudent','deleteClass','commitSeatRoster','backfillScoreBatch','demo','commitImport','restore','applySeatingPreview','settings','eventKinds','recordEvents','recordEventBatch','voidEvent','absent','start','startScheduled','end','score','backfillScore','undo','undoBatch','studentActive','layout','class','timetable','seatRules','scheduleFollow','pin','fixTop']);
  ipcMain.handle('classroom',async(event,action,p)=>{const owner=BrowserWindow.fromWebContents(event.sender);if(!owner||![win,manager].includes(owner))return {ok:false,error:'非法窗口'};try{const data=await handle(action,p,owner);if(changes.has(action))broadcast('data-changed',{action},event.sender);return {ok:true,data};}catch(e){return {ok:false,error:e.message};}});
  await win.loadFile(path.join(__dirname,'floating.html'));
  scheduleTimer=setInterval(()=>{try{if(store.tickSchedule())broadcast('schedule-changed');}catch(e){broadcast('schedule-error',e.message);}},1000);
  const topTimer=setInterval(()=>{const front=manager?.isVisible()?manager:win;if(shouldKeep(front,pinned))applyTop(front,true);},3000);
  win.on('closed',()=>{clearInterval(scheduleTimer);clearInterval(topTimer);});
  if(testing&&process.env.CLASSROOM_SCREENSHOT)setTimeout(async()=>{if(!win.isDestroyed())fs.writeFileSync(process.env.CLASSROOM_SCREENSHOT,(await win.webContents.capturePage()).toPNG());},2500);
}).catch(error=>{dialog.showErrorBox('课痕无法启动',`请保留数据文件并检查备份。\n${error.message}`);app.quit();});
app.on('window-all-closed',()=>app.quit());
