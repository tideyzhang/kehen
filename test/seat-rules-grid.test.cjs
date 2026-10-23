const {createRulesWorkbook}=require('./helpers/legacy-rules.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),Excel=require('exceljs');
const seating=require('../src/seating.cjs'),{parseRulesWorkbook}=require('../src/seat-rules-excel.cjs');
const {rangeCell,participationCell}=require('../src/seat-rules-grid.cjs');
async function fixture(){const students=Array.from({length:48},(_,i)=>({id:`s${i}`,number:String(i+1).padStart(3,'0'),name:`学生${i+1}`}));const c={name:'网格演示班',rows:8,cols:8,layout:Object.fromEntries(students.map((s,i)=>[`${Math.floor(i/8)},${i%8}`,s.id]))};c.layout['7,7']='aisle';const rules=seating.defaults(c,students);rules.seats=Object.fromEntries(Object.entries(c.layout).filter(([,v])=>v!=='aisle').map(([k])=>[k,'']));const wb=new Excel.Workbook();await wb.xlsx.load(await createRulesWorkbook(c,students,rules).xlsx.writeBuffer());return {students,c,rules,wb};}
test('visual rules use teacher-bottom 8x8, rectangular region edits and preserve aisles and empty seats',async()=>{
 const {students,c,rules,wb}=await fixture(),ws=wb.getWorksheet('座位范围');assert.equal(wb.worksheets[0].name,'座位范围');assert.equal(ws.getCell('A5').text,'第 8 排');assert.equal(ws.getCell('A12').text,'第 1 排');assert.equal(ws.getCell('I5').text,'过道');assert.match(ws.getCell('L12').text,/001 学生1/);assert.equal(ws.getCell('L5').text,'空位');assert.match(ws.getCell('L12').formula,/VLOOKUP/);
 for(let r=0;r<2;r++)for(let col=0;col<4;col++)ws.getCell(...rangeCell(c,r,col)).value='前部区';
 for(let i=0;i<16;i++)wb.getWorksheet('学生安排').getCell(i+2,3).value='前部区';
 const parsed=parseRulesWorkbook(wb,c,students,rules);assert.equal(Object.values(parsed.seats).filter(v=>v==='前部区').length,8);assert.equal(parsed.seats['0,0'],'前部区');assert.equal(parsed.seats['1,3'],'前部区');assert.equal(Object.hasOwn(parsed.seats,'7,7'),false);assert.equal(Object.hasOwn(parsed.seats,'7,0'),false);assert.equal(parsed.students.s0.category,'前部区');
 const generated=seating.generate(c,students,parsed);assert.equal(new Set(Object.values(generated.layout).filter(x=>x!=='aisle')).size,48);
});
test('visual grid rejects structural edits, invalid participation and aisle changes without changing rules',async()=>{
 for(const mutate of [ws=>ws.getCell('B2').value=7,ws=>ws.getCell('A5').value='第1排',ws=>ws.getCell('B4').value='第9列',ws=>ws.mergeCells('B5:C5'),ws=>ws.getCell('I5').value='',ws=>ws.getCell('B12').value='过道',ws=>ws.getCell('B17').value='maybe',ws=>ws.getCell('B5').value='未参与的范围',ws=>ws.getCell('B12').value={formula:'"区域"',result:'区域'}]){
  const {c,students,rules,wb}=await fixture(),before=JSON.stringify(rules);mutate(wb.getWorksheet('座位范围'));assert.throws(()=>parseRulesWorkbook(wb,c,students,rules));assert.equal(JSON.stringify(rules),before);
 }
});
test('legacy list templates remain importable alongside visual templates',async()=>{
 const {c,students,rules,wb}=await fixture();wb.removeWorksheet('座位范围');const ws=wb.addWorksheet('座位范围');ws.addRow(['排（从讲台起）','列（从左起）','参与编排','座位范围']);for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){const key=`${r},${col}`;if(c.layout[key]!=='aisle')ws.addRow([r+1,col+1,Object.hasOwn(rules.seats,key)?'是':'否','']);}
 assert.deepEqual(parseRulesWorkbook(wb,c,students,rules),rules);
});
