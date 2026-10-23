const seating=require('./seating.cjs');
const visualGrid=require('./seat-rules-grid.cjs');
function parseLegacyRulesWorkbook(wb,c,students,current){
  const rules={groups:[],seats:{},students:{},pairs:[],changeGroup:!!current.changeGroup,preferOuter:!!current.preferOuter};
  const text=c=>c.text.trim(),yes=(value,where)=>{if(['','否'].includes(value))return false;if(value==='是')return true;throw Error(where+'：请填写“是”或“否”');};
  function rows(name,headers,fn){const ws=wb.getWorksheet(name);if(!ws||headers.some((h,i)=>text(ws.getCell(1,i+1))!==h))throw Error(name+'：工作表缺失或表头不符，请使用本班规则模板');ws.eachRow((row,n)=>{if(n===1||!row.values.some(Boolean))return;if(row.cellCount>headers.length&&row.values.slice(headers.length+1).some(Boolean))throw Error(name+'第'+n+'行：请勿添加额外列');const cells=headers.map((_,i)=>row.getCell(i+1));if(cells.some(c=>c.isMerged))throw Error(name+'第'+n+'行：请取消合并');fn(cells.map(text),n);});}
  const people=new Map(students.map(s=>[s.number,s]));
  function student(number,name,where){const s=people.get(number);if(!s||s.name!==name)throw Error(where+'：学号或姓名与本班名单不符，请保留学号前导零');return s;}
  const category=(value,where)=>{if(value.length>30)throw Error(where+'：范围名称最多30字');return value;};
  const statusColumn=wb.getWorksheet('学生安排')?.getCell('F1').text==='在班状态';
  rows('学生安排',['学号','姓名','座位范围','固定当前座位','轮换前部优先',...(statusColumn?['在班状态']:[])],([number,name,range,fixed,priority,status],n)=>{const where='学生安排第'+n+'行',s=student(number,name,where);if(Object.hasOwn(rules.students,s.id))throw Error(where+'：学生重复');rules.students[s.id]={category:category(range,where),fixed:yes(fixed,where),outerPriority:yes(priority,where)};if(statusColumn){if(!['在班','不在班'].includes(status))throw Error(where+'：在班状态请填写在班或不在班');if(status==='不在班')rules.students[s.id].excluded=true;}});
  for(const s of students)if(!rules.students[s.id])rules.students[s.id]=structuredClone(current.students[s.id]||{category:'',fixed:false,outerPriority:false});
  const grid=wb.getWorksheet('座位范围');
  if([visualGrid.MARKER,visualGrid.LEGACY_MARKER].includes(grid?.getCell('A1').text))rules.seats=visualGrid.parseGrid(grid,c,category,rules,students);
  else {
  const seats=new Set();rows('座位范围',['排（从讲台起）','列（从左起）','参与编排','座位范围'],([r,col,on,range],n)=>{const row=Number(r)-1,column=Number(col)-1,key=`${row},${column}`;if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||row>=c.rows||column<0||column>=c.cols||c.layout[key]==='aisle'||seats.has(key))throw Error('座位范围第'+n+'行：坐标无效、重复或属于过道');seats.add(key);if(yes(on,'座位范围第'+n+'行'))rules.seats[key]=category(range,'座位范围第'+n+'行');});
  if(seats.size!==c.rows*c.cols-Object.values(c.layout).filter(v=>v==='aisle').length)throw Error('座位范围：请保留全部非过道位置');
  }
  const columns=new Set();rows('横向分组',['列（从左起）','横向组号'],([col,g],n)=>{const index=Number(col)-1;if(!Number.isInteger(index)||index<0||index>=c.cols||columns.has(index))throw Error('横向分组第'+n+'行：列号无效或重复');columns.add(index);rules.groups[index]=Number(g);});if(columns.size!==c.cols)throw Error('横向分组：列号不完整');
  rows('配对避邻',['学号1','姓名1','学号2','姓名2'],([an,a,bn,b],n)=>rules.pairs.push([student(an,a,'配对避邻第'+n+'行').id,student(bn,b,'配对避邻第'+n+'行').id]));
  return seating.validate(c,students,rules,{checkCapacity:false});
}
const simple=require('./seat-rules-simple.cjs');
function parseRulesPreview(wb,c,students,current,choices={}){return wb.getWorksheet('座位设置')?simple.parse(wb,c,students,current,choices):{rules:parseLegacyRulesWorkbook(wb,c,students,current),warnings:['已读取旧版规则；原有固定空位与不在班标记保留，未列出的学生沿用现有规则或默认规则，请核对。']};}
function parseRulesWorkbook(...args){return parseRulesPreview(...args).rules;}
module.exports={createRulesWorkbook:simple.create,parseRulesWorkbook,parseRulesPreview};
