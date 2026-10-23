const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs');
test('startup and classroom changes flush a writable handle under Windows access rules',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-windows-save-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const open=fs.openSync,flush=fs.fsyncSync,close=fs.closeSync,handles=new Map();let flushed=0;
 t.mock.method(fs,'openSync',(file,flags,...args)=>{const fd=open(file,flags,...args);handles.set(fd,flags);return fd;});
 t.mock.method(fs,'closeSync',fd=>{handles.delete(fd);return close(fd);});
 t.mock.method(fs,'fsyncSync',fd=>{if(handles.get(fd)==='r')throw Object.assign(Error('EPERM: operation not permitted, fsync'),{code:'EPERM',syscall:'fsync'});flushed++;return flush(fd);});
 const file=path.join(dir,'classroom.db'),s=await Store.open(file);t.after(()=>s.db.close());const cid=s.command('class',{name:'测试班'});s.command('start',{classId:cid,subject:'生物'});s.command('end');
 const reopened=await Store.open(file);try{assert.equal(reopened.snapshot().classes[0].name,'测试班');assert.equal(reopened.snapshot().sessions.length,1);assert.equal(reopened.active(),undefined);}finally{reopened.db.close();}assert.ok(flushed>=5);assert.equal(fs.existsSync(file+'.tmp'),false);
});
test('real fsync failure remains an error and preserves on-disk and in-memory data',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-flush-failure-')),file=path.join(dir,'classroom.db'),s=await Store.open(file);t.after(()=>{s.db.close();fs.rmSync(dir,{recursive:true,force:true});});
 s.command('class',{name:'原班级'});const before=fs.readFileSync(file),flush=fs.fsyncSync;
 t.mock.method(fs,'fsyncSync',()=>{throw Object.assign(Error('disk flush failed'),{code:'EIO'});});
 assert.throws(()=>s.command('class',{name:'不能写入的班级'}),{code:'EIO'});assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(s.snapshot().classes.map(c=>c.name),['原班级']);
 t.mock.method(fs,'fsyncSync',flush);s.command('class',{name:'重试成功'});const reopened=await Store.open(file);try{assert.equal(reopened.snapshot().classes.length,2);}finally{reopened.db.close();}
});
