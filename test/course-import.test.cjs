const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Excel=require('exceljs');
const {parseSchedule}=require('../src/planning-io.cjs'),{Store}=require('../src/store.cjs'),rows=require('./fixtures/course-week.json');
function workbook(){const w=new Excel.Workbook();w.addWorksheet('周课表').addRows(rows);return w;}
test('provided weekly schedule previews all 14 periods and blank Sunday without silently changing subjects',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-course-import-')),s=await Store.open(path.join(dir,'data.db'));t.after(()=>{s.db.close();fs.rmSync(dir,{recursive:true,force:true});});const id=s.command('class',{name:'测试班'}),before=s.snapshot();
 assert.throws(()=>parseSchedule(workbook(),before.subjects),/班主任.*外语/);const plan=parseSchedule(workbook(),before.subjects,{allowNewSubjects:true});assert.equal(plan.periods.length,14);assert.equal(plan.periods[0].subjects.length,7);assert.equal(plan.periods[0].subjects[6],'');assert.equal(plan.periods[0].subjects[1],'外语');assert.deepEqual(s.snapshot(),before);
 assert.throws(()=>s.command('timetable',{classId:id,config:plan}));assert.deepEqual(s.snapshot(),before);
 const bad=structuredClone(plan);bad.periods[1].start='06:40';assert.throws(()=>s.command('timetable',{classId:id,config:bad,enableNewSubjects:true}));assert.deepEqual(s.snapshot(),before);
 s.command('timetable',{classId:id,config:plan,enableNewSubjects:true});for(const subject of ['班主任','外语','自习','体育']){assert.ok(s.get('subjects').includes(subject));assert.ok(s.snapshot().classes[0].subjects.includes(subject));}assert.equal(s.snapshot().timetables[id].periods.length,14);assert.equal(s.active(),undefined);
 const again=await Store.open(s.file);try{assert.equal(again.snapshot().timetables[id].periods[0].subjects[1],'外语');}finally{again.db.close();}
});
