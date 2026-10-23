const {version}=require('../package.json');
const portableFolder=`课痕-${version}-Windows-x64-便携版`;
module.exports={version,portableFolder,portableZip:portableFolder+'.zip',installer:`课痕-${version}-Windows-x64-安装版.exe`,macZip:`课痕-${version}-macOS-arm64.zip`,checksums:'SHA256SUMS.txt',githubAssets:{installer:`kehen-${version}-Windows-x64-setup.exe`,portableZip:`kehen-${version}-Windows-x64-portable.zip`,macZip:`kehen-${version}-macOS-arm64.zip`}};
