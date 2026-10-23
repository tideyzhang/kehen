const fs=require('node:fs'),path=require('node:path');
function configureDataPath(app,{testDirectory,platform=process.platform,exePath=process.execPath}={}){
  let directory=testDirectory;
  if(!directory&&platform==='win32'&&app.isPackaged&&fs.existsSync(path.join(path.dirname(exePath),'portable.flag')))directory=path.join(path.dirname(exePath),'data');
  // Keep the existing data location when the display name changes to 课痕.
  if(!directory)directory=path.join(app.getPath('appData'),'classroom-points');
  fs.mkdirSync(directory,{recursive:true});
  app.setPath('userData',directory);
  app.setPath('sessionData',directory);
  return directory;
}
module.exports={configureDataPath};
