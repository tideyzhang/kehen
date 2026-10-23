// Use the exporting computer's local clock; avoid Windows-reserved punctuation.
function exportName(name,extension,date=new Date()){
  const pad=n=>String(n).padStart(2,'0');
  const stamp=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')}-${stamp}.${extension}`;
}
module.exports={exportName};
