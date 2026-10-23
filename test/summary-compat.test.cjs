const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs');
const periods=require('../src/summary-period.js');

test('summary presets use calendar month/week and a rolling 24-hour classroom time',()=>{
  const clock=new Date(2026,8,23,16,0),today=periods.range('today',{},clock);
  assert.equal(periods.range('all',{},clock).from,undefined);
  assert.deepEqual(periods.range('month',{},clock),{from:'2026-09-01',to:'2026-09-23'});
  assert.deepEqual(periods.range('week',{},clock),{from:'2026-09-21',to:'2026-09-23'});
  assert.deepEqual(periods.range('custom',{from:'2026-09-02',to:'2026-09-09'},clock),{from:'2026-09-02',to:'2026-09-09'});
  assert.deepEqual(periods.range('session',{sessionId:'lesson-1'},clock),{sessionId:'lesson-1'});
  assert.equal(new Date(today.fromInstant).getTime(),clock.getTime()-86400000);
  const sessions=new Map([['recent',{start:new Date(clock.getTime()-3600000).toISOString()}],['old',{start:new Date(clock.getTime()-90000000).toISOString()}]]);
  assert.equal(periods.matches({session_id:'recent',date:'2026-09-22'},today,sessions),true);
  assert.equal(periods.matches({session_id:'old',date:'2026-09-23'},today,sessions),false);
  assert.equal(periods.matches({session_id:null,date:'2026-09-22'},today,sessions),true,'date-only legacy entries include the boundary day');
});

test('0.5.0 database opens directly, keeps history and restores from its original bytes',async t=>{
  const source=fs.readFileSync(path.join(__dirname,'fixtures/v0.5.0.db'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-compat-')),file=path.join(dir,'classroom.db');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(file,source);
  const s=await Store.open(file);t.after(()=>s.db.close());
  const snap=s.snapshot();assert.equal(snap.classes.length,1);assert.equal(snap.classes[0].name,'旧版验证班');
  assert.deepEqual(snap.students.map(s=>s.number),['01','02']);
  assert.equal(snap.classes[0].layout['1,0'],snap.students[0].id);
  assert.equal(snap.sessions.length,1);
  assert.equal(s.records().length,3);assert.ok(s.records().some(r=>r.note==='旧版课堂积分'));
  assert.ok(s.records().some(r=>r.note==='旧版补录'));assert.equal(s.events()[0].note,'旧版情况');
  assert.equal(s.all('PRAGMA integrity_check')[0].integrity_check,'ok');
  const oldIds=s.records().map(r=>r.id);
  s.command('backfillScore',{classId:snap.classes[0].id,studentId:snap.students[0].id,subject:'生物',date:'2026-09-18',value:3});
  s.restore(source);assert.deepEqual(s.records().map(r=>r.id),oldIds);
  assert.equal(s.events()[0].note,'旧版情况');
});

test('database export query uses lesson start for the rolling day, not score creation',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-range-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'classroom.db');fs.copyFileSync(path.join(__dirname,'fixtures/v0.5.0.db'),file);
  const s=await Store.open(file);t.after(()=>s.db.close());
  const clock=new Date(2026,8,23,16,0),filter=periods.range('today',{},clock),session=s.snapshot().sessions[0];
  s.run('UPDATE sessions SET start=? WHERE id=?',[new Date(clock.getTime()-3600000).toISOString(),session.id]);
  assert.deepEqual(s.records(filter).map(r=>r.note),['旧版课堂积分']);
  s.run('UPDATE sessions SET start=? WHERE id=?',[new Date(clock.getTime()-90000000).toISOString(),session.id]);
  assert.equal(s.records(filter).length,0);
});

test('current class accepts old and new spreadsheet columns but rejects another class',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-import-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const s=await Store.open(path.join(dir,'classroom.db'));t.after(()=>s.db.close());
  const classId=s.command('class',{name:'本班'});
  const rows=[{'学号':'01','姓名':'甲'}];
  assert.equal(s.preview('roster',rows,'new-template',classId).errors.length,0);
  assert.equal(s.importRows('roster',rows,'new-template','名单',false,classId),1);
  assert.equal(s.preview('roster',[{'班级':'其他班',...rows[0]}],'wrong-class',classId).errors.length,1);
  assert.equal(s.preview('roster',[{'班级':'本班',...rows[0]}],'old-template',classId).rows[0].status,'已存在');
  assert.equal(s.preview('points',[{'学号':'01','姓名':'甲','日期':'2026-09-18','分值':'2','类别':'回答'}],'points',classId).errors.length,0);
});
