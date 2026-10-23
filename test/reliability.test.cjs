const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,day}=require('../src/store.cjs');

async function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kehen-reliability-'));
  const s=await Store.open(path.join(dir,'classroom.db'));
  t.after(()=>{s.db.close();fs.rmSync(dir,{recursive:true,force:true});});
  s.importRows('roster',[{班级:'测试班',学号:'01',姓名:'甲'},{班级:'测试班',学号:'02',姓名:'乙'}],'seed','名单');
  return {s,dir,c:s.snapshot().classes[0],people:s.snapshot().students};
}
function assertForeignKeys(s){
  assert.equal(s.one('PRAGMA foreign_keys').foreign_keys,1);
  assert.throws(()=>s.run('INSERT INTO draws VALUES (?,?,?,?)',['invalid','missing-session','missing-student',new Date().toISOString()]),/FOREIGN KEY/);
  assert.equal(s.all('PRAGMA foreign_key_check').length,0);
}
test('constraints survive startup, commits, saves, automatic/manual exports and restoration',async t=>{
  const {s,c,people}=await fixture(t);assertForeignKeys(s);
  s.save();assertForeignKeys(s);s.backup();assertForeignKeys(s);
  const bytes=s.exportBytes();assertForeignKeys(s);
  s.command('backfillScore',{classId:c.id,studentId:people[0].id,date:day(),subject:'生物',value:1});assertForeignKeys(s);
  s.command('undo',{id:s.records()[0].id});assertForeignKeys(s);
  s.restore(bytes);assertForeignKeys(s);assert.equal(s.records().length,0);
});
test('constraint and disk failures roll back data and retain enabled constraints',async t=>{
  const {s,c,people}=await fixture(t),before=fs.readFileSync(s.file);
  assert.throws(()=>s.tx(()=>{s.run('UPDATE students SET name=? WHERE id=?',['不应保存',people[0].id]);s.run('INSERT INTO draws VALUES (?,?,?,?)',['bad','missing','missing','now']);}),/FOREIGN KEY/);
  assert.equal(s.snapshot().students[0].name,'甲');assertForeignKeys(s);
  t.mock.method(s,'save',()=>{throw Error('disk full');});
  assert.throws(()=>s.command('backfillScore',{classId:c.id,studentId:people[0].id,date:day(),subject:'生物',value:1}),/disk full/);
  assert.equal(s.records().length,0);assert.deepEqual(fs.readFileSync(s.file),before);assertForeignKeys(s);
});
test('opening an existing orphaned database rejects it without changing the original bytes',async t=>{
  const {s,dir}=await fixture(t);const corrupt=new s.SQL.Database(s.exportBytes());
  corrupt.run('PRAGMA foreign_keys=OFF; INSERT INTO draws VALUES (\'orphan\',\'missing\',\'missing\',\'now\')');
  const file=path.join(dir,'orphan.db'),bytes=Buffer.from(corrupt.export());corrupt.close();fs.writeFileSync(file,bytes);
  await assert.rejects(Store.open(file),/关联记录不完整/);assert.deepEqual(fs.readFileSync(file),bytes);
});
test('backup pruning uses timestamps across labels and keeps a new same-millisecond backup',async t=>{
  const {s,dir}=await fixture(t),folder=path.join(dir,'backups');
  for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));
  for(let n=0;n<30;n++)fs.writeFileSync(path.join(folder,`${day()}-before-import-${1000+n}.db`),'old');
  t.mock.method(Date,'now',()=>2000);
  const first=s.backup('before-delete-student'),second=s.backup('before-delete-student');
  assert.notEqual(first,second);assert.ok(fs.existsSync(first));assert.ok(fs.existsSync(second));
  assert.equal(fs.readdirSync(folder).length,30);
  assert.equal(fs.existsSync(path.join(folder,`${day()}-before-import-1000.db`)),false);
  assert.equal(fs.existsSync(path.join(folder,`${day()}-before-import-1001.db`)),false);
  assertForeignKeys(s);
});
test('legacy backup names use modification time as retention fallback',async t=>{
  const {s,dir}=await fixture(t),folder=path.join(dir,'backups');
  for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));
  const legacy=path.join(folder,'legacy.db');fs.writeFileSync(legacy,'old');fs.utimesSync(legacy,new Date(0),new Date(0));
  for(let n=0;n<29;n++)fs.writeFileSync(path.join(folder,`${day()}-before-import-${1000+n}.db`),'old');
  s.backup();assert.equal(fs.readdirSync(folder).length,30);assert.equal(fs.existsSync(legacy),false);
});
test('failed backup writes or validation never prune existing backups',async t=>{
  const {s,dir}=await fixture(t),folder=path.join(dir,'backups');
  for(let n=0;n<31;n++)fs.writeFileSync(path.join(folder,`${day()}-old-${1000+n}.db`),'old');
  const before=fs.readdirSync(folder).sort(),write=fs.writeFileSync;
  t.mock.method(fs,'writeFileSync',(file,...args)=>{if(String(file).includes('-failure-')){write(file,'partial',...args.slice(1));throw Error('disk full');}return write(file,...args);});
  assert.throws(()=>s.backup('failure'),/disk full/);assert.deepEqual(fs.readdirSync(folder).sort(),before);
  t.mock.method(fs,'writeFileSync',(file,...args)=>String(file).includes('-corrupt-')?write(file,'corrupt',...args.slice(1)):write(file,...args));
  assert.throws(()=>s.backup('corrupt'));assert.deepEqual(fs.readdirSync(folder).sort(),before);assertForeignKeys(s);
});
test('roster status preview and commit preserve identity, history and unlisted students',async t=>{
  const {s,c,people}=await fixture(t),[a,b]=people;
  s.command('layout',{classId:c.id,rows:2,cols:2,layout:{'0,0':a.id},subjects:c.subjects});
  s.command('backfillScore',{classId:c.id,studentId:a.id,date:day(),subject:'生物',value:2});
  const row={学号:a.number,姓名:a.name,状态:'停用'},p=s.preview('roster',[row],'status',c.id);
  assert.equal(p.errors.length,0);assert.equal(p.rows[0].status,'停用');assert.equal(s.snapshot().students[0].active,1);
  s.importRows('roster',[row],'status','停用名单',false,c.id);
  assert.equal(s.snapshot().students[0].active,0);assert.equal(s.snapshot().students[1].active,1);assert.deepEqual(s.snapshot().classes[0].layout,{});assert.equal(s.records()[0].student_id,a.id);
  s.importRows('roster',[{...row,状态:''},{学号:'03',姓名:'丙',状态:'停用'}],'legacy','保留状态',false,c.id);
  assert.equal(s.snapshot().students[0].active,0);assert.equal(s.snapshot().students[2].active,0);
  assert.equal(s.preview('roster',[{...row,状态:'在班'}],'restore',c.id).rows[0].status,'恢复');
  s.importRows('roster',[{...row,状态:'在班'}],'restore','恢复',false,c.id);assert.equal(s.snapshot().students[0].active,1);
  s.command('start',{classId:c.id,subject:'生物'});
  const live=s.preview('roster',[row],'live',c.id);assert.match(live.errors.join('\n'),/结束/);
  assert.throws(()=>s.importRows('roster',[row],'live','上课中',false,c.id),/结束/);s.command('end');
  s.command('deleteStudent',{id:b.id});assert.match(s.preview('roster',[{学号:b.number,姓名:b.name}],'deleted',c.id).errors.join('\n'),/已删除/);
  assert.throws(()=>s.importRows('roster',[row,{学号:'04',姓名:'丁',状态:'未知'}],'invalid','坏状态',false,c.id),/第3行.*状态/);
  assert.equal(s.snapshot().students[0].active,1);assert.equal(s.snapshot().students.length,3);assertForeignKeys(s);
});
