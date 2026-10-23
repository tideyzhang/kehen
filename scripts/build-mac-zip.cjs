const path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {macZip}=require('./release-files.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'dist/mac-arm64/课痕.app'),target=path.join(root,'dist',macZip);
execFileSync(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--mac','dir','--arm64',...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
if(!fs.existsSync(source))throw Error('请先构建 Mac 应用');
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',source,target],{stdio:'inherit'});
console.log('MAC_ZIP_READY: '+target);
