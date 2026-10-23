const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),archiver=require('archiver');
const {version,portableFolder,portableZip}=require('./release-files.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  execFileSync(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--win','dir','--x64','--config.directories.output=dist/portable-build',...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
  const folder=path.join(root,'dist/portable-build/win-unpacked');
  fs.writeFileSync(path.join(folder,'portable.flag'),'Classroom Points portable mode: keep this file beside the executable.\r\n');
  fs.mkdirSync(path.join(folder,'data'),{recursive:true});
  fs.writeFileSync(path.join(folder,'使用前请读.txt'),'\uFEFF'+[
    `课痕 ${version} Windows x64 便携版`,
    '',
    '1. 将压缩包全部解压到有写入权限的文件夹，双击“课痕.exe”即可，无需安装。',
    '2. 不要在压缩包内直接运行；不要只复制exe。请保留resources、DLL及portable.flag等全部文件。',
    '3. 数据、设置、缓存与自动备份保存在旁边的data文件夹。首次运行是空白数据，可导入名单。',
    `4. 换电脑前退出程序，再复制整个“${portableFolder}”文件夹。使用U盘时也先退出再拔出。`,
    '5. 从安装版迁移：在旧程序“备份恢复”导出完整备份，在便携版恢复。不要直接用空data覆盖旧数据。',
    '6. 更新便携版：先关闭旧版并备份，解压新版到新位置，将旧版data文件夹完整复制到新版旁边。',
    `7. 课痕${version}可继续使用原“课堂积分”data中的classroom.db；仍请在教室测试启动、加分、退出重开及置顶。`,
    '8. 便携版不会自动读取安装版的数据；两个版本的数据分别保存。',
    '9. 建议在本地文件夹运行，退出后再备份或同步。不要在两台电脑同时修改同一份同步数据。'
  ].join('\r\n'));
  const target=path.join(root,'dist',portableZip),output=fs.createWriteStream(target),archive=archiver('zip',{zlib:{level:6}});
  const completed=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});
  archive.pipe(output);archive.directory(folder,portableFolder);await archive.finalize();await completed;
  console.log('PORTABLE_READY: '+target);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
