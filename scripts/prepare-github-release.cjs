const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const names=require('./release-files.cjs'),dist=path.resolve(__dirname,'../dist'),target=path.join(dist,'github');
fs.mkdirSync(target,{recursive:true});
const sums=[];
for(const key of ['installer','portableZip','macZip']){
  const source=path.join(dist,names[key]),name=names.githubAssets[key];
  fs.copyFileSync(source,path.join(target,name));
  sums.push(`${crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')}  ${name}`);
}
fs.writeFileSync(path.join(target,names.checksums),sums.join('\n')+'\n');
console.log('GITHUB_RELEASE_READY: '+target);
