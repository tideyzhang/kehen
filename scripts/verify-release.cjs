const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),asar=require('@electron/asar');
const {version,installer,portableZip,macZip,checksums}=require('./release-files.cjs');
const root=path.resolve(__dirname,'..');
const archives=['dist/mac-arm64/课痕.app/Contents/Resources/app.asar','dist/win-unpacked/resources/app.asar','dist/portable-build/win-unpacked/resources/app.asar'];
for(const relative of archives){const file=path.join(root,relative);assert.equal(JSON.parse(asar.extractFile(file,'package.json').toString()).version,version);for(const name of fs.readdirSync(path.join(root,'src'),{recursive:true})){if(fs.statSync(path.join(root,'src',name)).isFile())assert.deepEqual(asar.extractFile(file,'src/'+name),fs.readFileSync(path.join(root,'src',name)),`${relative}: ${name}`);}for(const name of asar.listPackage(file).filter(n=>n.endsWith('/brace-expansion/package.json'))){const v=JSON.parse(asar.extractFile(file,name.slice(1)).toString()).version;assert.ok(['1.1.21','2.1.7'].includes(v),`${relative}: vulnerable brace-expansion ${v}`);}console.log('SOURCE_AND_DEPENDENCIES_MATCH',relative);}
const ResEdit=require('resedit'),approved=ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root,'build/icon.ico'))).icons.map(i=>Buffer.from(i.data.bin));
for(const name of ['dist/win-unpacked/课痕.exe','dist/portable-build/win-unpacked/课痕.exe','dist/'+installer]){
 const resource=ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(fs.readFileSync(path.join(root,name)))),groups=ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries);
 assert.ok(groups.some(group=>{const items=group.getIconItemsFromEntries(resource.entries);return items.length===approved.length&&approved.every(bytes=>items.some(item=>item.isRaw()&&Buffer.from(item.bin).equals(bytes)));}),`${name}: approved icon missing`);
 const info=ResEdit.Resource.VersionInfo.fromEntries(resource.entries);assert.ok(info.some(v=>v.getAllLanguagesForStringValues().some(lang=>v.getStringValues(lang).ProductName==='课痕')));console.log('WINDOWS_ICON_MATCH',name);
}
assert.deepEqual(fs.readFileSync(path.join(root,'dist/mac-arm64/课痕.app/Contents/Resources/icon.icns')),fs.readFileSync(path.join(root,'build/icon.icns')));console.log('MAC_ICON_MATCH');
const files=[installer,portableZip,macZip];
const hashes=files.map(name=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex')}  ${name}`).join('\n')+'\n';fs.writeFileSync(path.join(root,'dist',checksums),hashes);console.log('RELEASE_VERIFIED',version);
