const identity=require('./seat-identity.cjs');
const Excel=require('exceljs');
function createSeatWorkbook(c,students){
  const wb=new Excel.Workbook(),ws=wb.addWorksheet('座位表');const layout={...c.layout};
  if(!Object.values(layout).some(v=>v!=='aisle')){const keys=Array.from({length:c.rows*c.cols},(_,i)=>`${Math.floor(i/c.cols)},${i%c.cols}`).filter(k=>layout[k]!=='aisle');students.slice(0,keys.length).forEach((s,i)=>layout[keys[i]]=s.id);}
  const byId=new Map(students.map(s=>[s.id,s]));
  for(let r=0;r<c.rows;r++){ws.getRow(r+1).height=38;for(let col=0;col<c.cols;col++){
    ws.getColumn(col+1).width=20;const cell=ws.getCell(r+1,col+1),value=layout[`${c.rows-1-r},${col}`],student=byId.get(value);
    cell.value=value==='aisle'?'过道':student?identity.label(student):'';
    cell.font={name:'Microsoft YaHei',size:12};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:value==='aisle'?'FFF0F0F0':'FFF1F6F0'}};
    cell.border=Object.fromEntries(['top','left','bottom','right'].map(side=>[side,{style:'thin',color:{argb:'FFCAD8CB'}}]));
  }}
  ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1};
  const roster=wb.addWorksheet('本班名单');roster.columns=[{header:'姓名',key:'name',width:24}];students.forEach(s=>roster.addRow({name:identity.label(s)}));roster.getRow(1).font={bold:true};
  const help=wb.addWorksheet('填写说明');help.getColumn(1).width=100;
  [ `${c.name} · 座位表填写说明`, '1. 第一张“座位表”就是导入网格，每个格子对应一个座位。页面下方为讲台方向（统一教师视角）。',
    '2. 已按本班名单生成；已有座位时沿用当前布局，无布局时从左下角按学号安排。',
    '3. 移动姓名文本即可调整座位。不要添加标题行，不要合并单元格，不要把同一学生放两处。',
    '4. 删除格内文字表示空位；填“过道”表示过道。选择同步名单并确认导入时，名单中未出现在座位表的学生将停用；仅更新座位不改变名单状态，历史记录保留。',
    '5. “本班名单”页提供可复制的文本；同名学生可设置座位显示名，或在导入时逐项核对。新学生可直接填写姓名，系统按名单最大数字学号往后分配学号。',
    '6. 保存为 .xlsx 后，在软件中点击“导入座位 Excel”，检查预览，核对新增、恢复及停用名单，再确认导入。',
    '7. 需要减少行列时，软件会优先删除整行/整列空位；若仍有学生或过道，先在预览中调整。'
  ].forEach(t=>help.addRow([t]));help.eachRow(r=>{r.height=35;r.alignment={wrapText:true,vertical:'middle'};});
  return wb;
}
function parseSeatWorkbook(wb,students,choices={}){
  const ws=wb.getWorksheet('座位表')||wb.worksheets[0];if(!ws||ws.rowCount>20||ws.columnCount>20)throw Error('座位表须为不超过20×20的纯座位网格，请使用本班模板');
  // Templates exported before 0.2.1 used the original top-stage row order.
  const legacy=wb.getWorksheet('填写说明')?.getCell('A2').text.includes('页面上方为讲台方向');
  const layout={},unmatched=[],seen=new Set();
  ws.eachRow((row,r)=>row.eachCell((cell,col)=>{const value=cell.text.trim();if(!value)return;
    if(cell.isMerged){unmatched.push(`${r}行${col}列：请取消合并单元格`);return;}
    if(value==='过道'){layout[`${legacy?r-1:ws.rowCount-r},${col-1}`]='aisle';return;}
    const match=identity.resolve(value,students,`${ws.name}!${cell.address}`,choices),matches=match?[match]:[];
    if(matches.length!==1||seen.has(matches[0].id)){unmatched.push(`${r}行${col}列：${value}`);return;}
    seen.add(matches[0].id);layout[`${legacy?r-1:ws.rowCount-r},${col-1}`]=matches[0].id;
  }));return {rows:Math.max(1,ws.rowCount),cols:Math.max(1,ws.columnCount),layout,unmatched};
}
module.exports={createSeatWorkbook,parseSeatWorkbook};

// A current-seat import may synchronize the roster; previous-seat imports stay strict.
function previewSeatRoster(wb,students,choices={}){
  const {randomUUID}=require('node:crypto'),{nextNumber}=require('./roster.cjs');
  const ws=wb.getWorksheet('座位表')||wb.worksheets[0];if(!ws||ws.rowCount>20||ws.columnCount>20)throw Error('座位表须为不超过20×20的纯座位网格');
  const legacy=wb.getWorksheet('填写说明')?.getCell('A2').text.includes('页面上方为讲台方向');
  const all=[...students],additions=[],layout={},errors=[],seen=new Set();
  ws.eachRow((row,r)=>row.eachCell((cell,col)=>{
    const text=cell.text.trim(),key=`${legacy?r-1:ws.rowCount-r},${col-1}`;if(!text)return;
    if(cell.isMerged){errors.push(`${r}行${col}列：请取消合并单元格`);return;}
    if(text==='过道'){layout[key]='aisle';return;}
    const match=identity.resolve(text,all,`${ws.name}!${cell.address}`,choices);let matches=match?[match]:[];
    const pair=text.match(/^(\d+)\s+(.+)$/),name=(pair?pair[2]:text).trim();
    if(!matches.length&&pair){const found=identity.resolve(name,all,`${ws.name}!${cell.address}`,choices);if(found)matches=[found];}
    if(!matches.length){
      if(/^\d+$/.test(name)||name.length>50){errors.push(`${r}行${col}列：请填写姓名或“学号 姓名”，不能仅用未知学号`);return;}
      const student={id:randomUUID(),number:nextNumber(all),name,active:1};additions.push(student);all.push(student);matches=[student];
    }
    if(matches.length!==1){errors.push(`${r}行${col}列：${text} 有重名，请用学号区分`);return;}
    if(seen.has(matches[0].id)){errors.push(`${r}行${col}列：${text} 重复安排`);return;}
    seen.add(matches[0].id);layout[key]=matches[0].id;
  }));
  if(!seen.size)errors.push('座位表至少需要一名学生，不能用空表停用全班');
  if(errors.length)throw Error(errors.join('\n'));
  return {rows:Math.max(1,ws.rowCount),cols:Math.max(1,ws.columnCount),layout,additions,disabled:students.filter(s=>s.active&&!seen.has(s.id)),reactivated:students.filter(s=>!s.active&&seen.has(s.id)),students:all.filter(s=>seen.has(s.id))};
}
module.exports.previewSeatRoster=previewSeatRoster;
