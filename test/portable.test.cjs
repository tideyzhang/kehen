const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configureDataPath}=require('../src/portable.cjs'),{Store}=require('../src/store.cjs');
test('portable Windows keeps database and backups next to executable and survives moving folder',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-portable-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'中文 便携版');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'portable.flag'),'');const paths={},app={isPackaged:true,setPath:(k,v)=>paths[k]=v};
 const directory=configureDataPath(app,{platform:'win32',exePath:path.join(folder,'课堂积分.exe')});assert.equal(directory,path.join(folder,'data'));assert.equal(paths.sessionData,directory);
 const store=await Store.open(path.join(directory,'classroom.db'));try{store.command('class',{name:'随身班级'});store.backup();}finally{store.db.close();}
 const moved=path.join(root,'另一台电脑');fs.renameSync(folder,moved);const movedData=configureDataPath(app,{platform:'win32',exePath:path.join(moved,'课堂积分.exe')});const reopened=await Store.open(path.join(movedData,'classroom.db'));try{assert.equal(reopened.snapshot().classes[0].name,'随身班级');assert.ok(fs.readdirSync(path.join(movedData,'backups')).length);}finally{reopened.db.close();}
});
test('renamed installed and development apps retain legacy data paths; isolated tests take precedence',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-paths-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const paths={},app={isPackaged:true,getPath:key=>{assert.equal(key,'appData');return root;},setPath:(key,value)=>paths[key]=value},exePath=path.join(root,'课痕.exe'),legacy=path.join(root,'classroom-points');
 assert.equal(configureDataPath(app,{platform:'win32',exePath}),legacy);assert.equal(paths.userData,legacy);assert.equal(paths.sessionData,legacy);fs.writeFileSync(path.join(root,'portable.flag'),'');assert.equal(configureDataPath(app,{platform:'darwin',exePath}),legacy);app.isPackaged=false;assert.equal(configureDataPath(app,{platform:'win32',exePath}),legacy);app.isPackaged=true;const testDirectory=path.join(root,'isolated');assert.equal(configureDataPath(app,{platform:'win32',exePath,testDirectory}),testDirectory);assert.equal(paths.userData,testDirectory);assert.equal(fs.existsSync(path.join(root,'data')),false);
});
