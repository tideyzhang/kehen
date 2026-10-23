const Excel=require('exceljs'),seating=require('./seating.cjs'),identity=require('./seat-identity.cjs');
const encode=v=>['通用','留空','过道'].includes(v)||v.startsWith('分区：')?'分区：'+v:v;
function create(c,students,rules){
  const wb=new Excel.Workbook(),ws=wb.addWorksheet('座位设置');
  ws.addRow(['座位规则 v4 · 讲台在下方']);ws.addRow(['轮换组',...rules.groups]);ws.addRow(['排 / 列',...rules.groups.map((_,i)=>`第${i+1}列`)]);
  for(let i=0;i<c.rows;i++){const r=c.rows-1-i;ws.addRow([`第${r+1}排`,...Array.from({length:c.cols},(_,col)=>{const key=`${r},${col}`;return c.layout[key]==='aisle'?'过道':Object.hasOwn(rules.seats,key)?encode(rules.seats[key])||'通用':'留空';})]);}
  ws.addRow(['讲台 · 教师视角']);
  const roster=wb.addWorksheet('学生规则');roster.addRow(['姓名','座位分区','固定位置','轮换前部优先']);
  for(const s of students.filter(s=>!s.deleted_at)){const p=rules.students[s.id]||{},key=p.fixedSeat||(p.fixed?Object.keys(c.layout).find(k=>c.layout[k]===s.id):null),position=key?.split(',').map(Number);const row=roster.addRow([identity.label(s),p.category||'',position?`第${position[0]+1}排第${position[1]+1}列`:p.fixed?'当前座位（待确定）':'',(p.outerPriority===undefined?p.category==='3':p.outerPriority)?'是':'否']);row.getCell(4).dataValidation={type:'list',allowBlank:true,formulae:['"是,否"']};}
  const pairs=wb.addWorksheet('配对避邻'),byId=new Map(students.map(s=>[s.id,s]));pairs.addRow(['姓名1','姓名2']);for(const [a,b] of rules.pairs)if(byId.has(a)&&byId.has(b))pairs.addRow([identity.label(byId.get(a)),identity.label(byId.get(b))]);
  for(const sheet of wb.worksheets){sheet.columns.forEach(col=>col.width=22);sheet.eachRow(row=>{row.height=32;row.alignment={vertical:'middle',horizontal:'center',wrapText:true};});sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF285AAF'}};sheet.views=[{state:'frozen',ySplit:sheet===ws?3:1}];}
  const help=wb.addWorksheet('填写说明');help.getColumn(1).width=110;
  [ `${c.name} · 简化规则模板。只编辑前三张表；姓名对应现有学生，规则文件不新增学生。`,
    '座位设置：讲台在下方，第1排最靠讲台。空白或通用表示可用座位；留空表示始终空着；过道沿用班级座位，不可在规则文件中改变。多余可用座位允许空着。',
    '分区：座位填前部区等名称，仅接收学生规则中同名分区的学生；通用座位接收任何分区。分区不是轮换组。若分区名称恰为通用、留空、过道或以分区：开头，在座位格前加分区：，学生分区列保持原名。',
    '轮换组在座位设置第2行，从左向右由1开始连续编号。通常每张双人桌的两列同组。',
    '学生规则：固定位置填第2排第3列，排从讲台起、列从左起。不固定留空。旧规则的固定当前座位若暂无位置，会显示当前座位（待确定），保留此文字可保留旧标记；排座前需为参与学生指定有效位置。轮换前部优先填是或否，配合程序轮换开关使用，属于可让步的偏好。',
    '完整名单包含停用学生，规则暂时休眠，返班后恢复。删除学生行表示保留原规则；保留该行而清空分区、固定位置或优先列表示清除对应规则。',
    '配对避邻：每行两个姓名，禁止同排同组、同排相邻组、同组前后相邻排。删除所有数据行会清空配对；删除整张表会保留原配对并提示。',
    '同名学生可在程序的本轮人员中设置座位显示名，例如张晨（甲）。不设也可导出，导入时逐项确认。旧版学号与姓名写法仍兼容。',
    '在班状态在班级名单中维护；临时缺席在程序本轮人员中取消参与。不要通过删除规则行来停用学生。',
    '导入只生成草稿并显示变更摘要。通过基本检查不代表全部配对约束一定有解，生成成功后仍需应用座位。' ].forEach(t=>{const row=help.addRow([t]);row.height=48;row.alignment={wrapText:true,vertical:'middle'};});return wb;
}
function parse(wb,c,students,current,choices={}){
  const rules=structuredClone(current),errors=[],warnings=[],ws=wb.getWorksheet('座位设置');rules.version=4;rules.seats={};rules.groups=[];
  const text=(sheet,r,col)=>{const cell=sheet.getCell(r,col);if(cell.isMerged)errors.push(`${sheet.name}!${cell.address}：请取消合并`);if(cell.type===Excel.ValueType.Formula)errors.push(`${sheet.name}!${cell.address}：请填写文字，不使用公式`);return cell.text.trim();};
  if(!ws||ws.getCell('A1').text!=='座位规则 v4 · 讲台在下方')throw Error('座位设置：请使用新版规则模板');
  if(ws.rowCount!==c.rows+4||ws.columnCount!==c.cols+1)errors.push('座位设置：网格尺寸与当前班级不符，请重新下载模板');
  if(text(ws,2,1)!=='轮换组'||text(ws,3,1)!=='排 / 列'||text(ws,c.rows+4,1)!=='讲台 · 教师视角')errors.push('座位设置：请保留标题和讲台行');
  for(let col=0;col<c.cols;col++){rules.groups.push(Number(text(ws,2,col+2)));if(text(ws,3,col+2)!==`第${col+1}列`)errors.push(`座位设置：第${col+1}列标签被修改，请勿排序网格`);}
  for(let i=0;i<c.rows;i++)if(text(ws,i+4,1)!==`第${c.rows-i}排`)errors.push(`座位设置：第${i+4}行排号被修改，请勿排序网格`);
  for(let i=0;i<c.rows;i++)for(let col=0;col<c.cols;col++){const key=`${c.rows-1-i},${col}`,v=text(ws,i+4,col+2),where=`座位设置!${ws.getCell(i+4,col+2).address}`;if(c.layout[key]==='aisle'){if(v!=='过道')errors.push(where+'：过道须保持不变');continue;}if(v==='过道'){errors.push(where+'：请在班级座位页面调整过道');continue;}if(v==='留空')continue;const category=v.startsWith('分区：')?v.slice(3):v==='通用'?'':v;if(category.length>30)errors.push(where+'：分区名最多30字');rules.seats[key]=category;}
  function rows(name,headers,fn){const sheet=wb.getWorksheet(name);if(!sheet)throw Error(name+'：工作表缺失');if(headers.some((h,i)=>text(sheet,1,i+1)!==h))throw Error(name+'：表头不符');sheet.eachRow((row,n)=>{if(n===1||!row.values.some(Boolean))return;try{if(row.values.slice(headers.length+1).some(Boolean))throw Error('请勿添加额外列');fn(headers.map((_,i)=>text(sheet,n,i+1)),n);}catch(e){if(e.nameConflict)throw e;errors.push(name+'第'+n+'行：'+e.message);}});}
  const resolve=(v,where)=>{const s=identity.resolve(v,students,where,choices);if(!s)throw Error(`${where}：找不到“${v}”，请先在班级名单中添加`);return s;};
  const seen=new Set();rows('学生规则',['姓名','座位分区','固定位置','轮换前部优先'],([name,category,position,priority],n)=>{const s=resolve(name,`学生规则!A${n}`);if(seen.has(s.id))throw Error('学生重复');seen.add(s.id);if(category.length>30)throw Error('分区名最多30字');if(!['','是','否'].includes(priority))throw Error('优先请填是或否');const p={category,fixed:!!position,outerPriority:priority==='是'};if(rules.students[s.id]?.excluded)p.excluded=true;if(position&&position!=='当前座位（待确定）'){const m=position.match(/^第(\d+)排第(\d+)列$/);if(!m||+m[1]<1||+m[1]>c.rows||+m[2]<1||+m[2]>c.cols)throw Error('固定位置请填写有效的第2排第3列');p.fixedSeat=`${+m[1]-1},${+m[2]-1}`;}rules.students[s.id]=p;});
  if(wb.getWorksheet('配对避邻')){rules.pairs=[];rows('配对避邻',['姓名1','姓名2'],([a,b],n)=>rules.pairs.push([resolve(a,`配对避邻!A${n}`).id,resolve(b,`配对避邻!B${n}`).id]));}else warnings.push('缺少配对避邻表：保留原配对');
  if(errors.length)throw Error(errors.join('\n'));
  return {rules:seating.validate(c,students,rules,{checkCapacity:false}),warnings,updatedStudents:seen.size,preservedStudents:students.length-seen.size,pairsCleared:current.pairs.length>0&&!rules.pairs.length};
}
module.exports={create,parse};
