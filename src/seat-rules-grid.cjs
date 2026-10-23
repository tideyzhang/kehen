const LEGACY_MARKER='座位范围 · 可视化模板 v2';
const MARKER='座位范围 · 可视化模板 v3';
const firstRow=5;
const rangeCell=(c,r,col)=>[firstRow+c.rows-1-r,col+2];
const participationCell=(c,r,col)=>[firstRow+c.rows+4+c.rows-1-r,col+2];
function createGrid(wb,c,students,rules,label){
  const ws=wb.addWorksheet('座位范围'),byId=new Map(students.map(s=>[s.id,s])),fixed=new Map();for(const st of students){const p=rules.students[st.id]||{};if(p.fixed&&!p.excluded){const key=p.fixedSeat||Object.keys(c.layout).find(k=>c.layout[k]===st.id);if(key)fixed.set(key,st);}}
  ws.getCell('A1').value=MARKER;ws.getCell('A2').value='排数';ws.getCell('B2').value=c.rows;ws.getCell('C2').value='列数';ws.getCell('D2').value=c.cols;
  ws.getCell('F2').value=c.name;ws.getRow(1).height=30;ws.getCell('A1').font={bold:true,size:18,color:{argb:'FF286458'}};
  const referenceCol=c.cols+4;
  ws.mergeCells(1,1,1,referenceCol+c.cols-1);
  ws.mergeCells(3,2,3,c.cols+1);ws.mergeCells(3,referenceCol,3,referenceCol+c.cols-1);
  ws.getCell(3,2).value='① 划定座位范围（可编辑）';ws.getCell(3,referenceCol).value='当前座位与学生分组（自动参考）';
  ws.getCell(firstRow+c.rows+2,2).value='② 空位类型（可选座位 / 固定空位）';
  const colors=['FFE2EFD9','FFDDEBF7','FFFCE4D6','FFE4DFF0','FFFFF2CC','FFDCEFEB'];
  const names=[...new Set([...Object.values(rules.seats),...Object.values(rules.students).map(p=>p.category)].filter(Boolean).map(label))];
  ws.getColumn(1).width=10;for(let col=2;col<referenceCol+c.cols;col++)ws.getColumn(col).width=18;ws.getColumn(c.cols+2).width=3;ws.getColumn(c.cols+3).width=10;
  for(let col=0;col<c.cols;col++)for(const [row,start] of [[4,2],[4,referenceCol],[firstRow+c.rows+3,2]])ws.getCell(row,start+col).value=`第 ${col+1} 列`;
  function style(cell,fill){cell.font={name:'Microsoft YaHei',size:11,color:{argb:'FF24443D'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};cell.border=Object.fromEntries(['top','bottom','left','right'].map(side=>[side,{style:'thin',color:{argb:'FFB5C9C0'}}]));}
  for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){
    const key=`${r},${col}`,aisle=c.layout[key]==='aisle',s=byId.get(c.layout[key]),[row,column]=rangeCell(c,r,col),[onRow]=participationCell(c,r,col);
    const cell=ws.getCell(row,column),on=ws.getCell(onRow,column),ref=ws.getCell(row,referenceCol+col);
    ws.getRow(row).height=58;ws.getRow(onRow).height=28;
    ws.getCell(row,1).value=`第 ${r+1} 排`;ws.getCell(row,referenceCol-1).value=`第 ${r+1} 排`;ws.getCell(onRow,1).value=`第 ${r+1} 排`;
    const locked=fixed.get(key);cell.value=aisle?'过道':locked?`固定：${locked.number} ${locked.name}`:Object.hasOwn(rules.seats,key)?label(rules.seats[key]):'固定空位';on.value=aisle?'过道':Object.hasOwn(rules.seats,key)?'可选座位':'固定空位';
    const lookup=s?`VLOOKUP("${s.number.replace(/"/g,'""')}",'学生安排'!$A$2:$E$${students.length+1},3,FALSE)`:'';
    ref.value=aisle?'过道':s?{formula:`"${`${s.number} ${s.name}`.replace(/"/g,'""')}"&CHAR(10)&IFERROR(IF(${lookup}="","未设范围",${lookup}),"名单已变更")`,result:`${s.number} ${s.name}\n${label(rules.students[s.id]?.category)||'未设范围'}`}:'空位';
    style(cell,aisle?'FFE5E5E5':'FFFFF8DE');style(on,aisle?'FFE5E5E5':'FFF1F6F0');style(ref,aisle?'FFE5E5E5':'FFF1F6F0');
    if(!aisle){on.dataValidation={type:'list',allowBlank:false,formulae:['"可选座位,固定空位"'],showErrorMessage:true,error:'请选择可选座位或固定空位'};
      for(let i=0;i<names.length;i++)ws.addConditionalFormatting({ref:cell.address,rules:[{type:'expression',formulae:[`${cell.address}="${names[i].replace(/"/g,'""')}"`],style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:colors[i%colors.length]}}}}]});
    }
  }
  for(const [row,start] of [[firstRow+c.rows,2],[firstRow+c.rows,referenceCol],[firstRow+c.rows*2+4,2]]){ws.mergeCells(row,start,row,start+c.cols-1);const cell=ws.getCell(row,start);cell.value='讲台在下方 · 第1排靠讲台';cell.font={bold:true,color:{argb:'FF286458'}};}
  const notes=firstRow+c.rows*2+6;
  ['选择左上网格的一片格子，批量填写同一个范围名称，即可划定区域；范围留空表示不限学生。',
    '学生分组在“学生安排”的“座位范围”列修改；右侧自动显示现有座位的学生及其所属范围。右侧仅供参考，不用于换座。',
    '上方填“固定空位”始终留空；填“可选空位”允许分配或留空；填“固定：学号 姓名”指定学生。下方选择可选座位或固定空位；过道保持原样。仅涂颜色或画边框不会定义范围，不要合并格子或插入删除行列。',
    '范围名称须与学生安排一致。可先在学生安排命名，再在左上网格填同名文字；新范围重新导出后会配色。',
    '学生安排新增“在班状态”：填“不在班”忽略排座，名单和积分不变。某范围允许设置多于学生人数的可选座位。导入只更新规则草稿，不移动学生，保存或应用后生效。'
  ].forEach((line,i)=>{ws.mergeCells(notes+i,2,notes+i,referenceCol+c.cols-1);ws.getCell(notes+i,2).value=line;ws.getCell(notes+i,2).alignment={wrapText:true,vertical:'middle'};ws.getRow(notes+i).height=32;});
  ws.views=[{state:'frozen',xSplit:1,ySplit:4,zoomScale:70}];ws.properties.tabColor={argb:'FF286458'};
  ws.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:1};
  wb.calcProperties.fullCalcOnLoad=true;
  return ws;
}
function parseGrid(ws,c,category,rules,students){
  if(ws.getCell('B2').value!==c.rows||ws.getCell('D2').value!==c.cols)throw Error('座位范围：模板行列与当前网格不符，请重新下载');
  const seats={};
  for(let col=0;col<c.cols;col++)if(ws.getCell(4,col+2).text!==`第 ${col+1} 列`||ws.getCell(firstRow+c.rows+3,col+2).text!==`第 ${col+1} 列`)throw Error('座位范围：请勿插入、删除或移动列');
  for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){
    const key=`${r},${col}`,[row,column]=rangeCell(c,r,col),[onRow]=participationCell(c,r,col),cell=ws.getCell(row,column),on=ws.getCell(onRow,column);
    if(ws.getCell(row,1).text!==`第 ${r+1} 排`||ws.getCell(onRow,1).text!==`第 ${r+1} 排`)throw Error('座位范围：请勿插入、删除或移动行');
    if(cell.isMerged||on.isMerged||cell.formula||on.formula)throw Error(`座位范围 ${cell.address}：请填写文字，不要合并或使用公式`);
    const value=cell.text.trim(),flag=on.text.trim();
    if(c.layout[key]==='aisle'){if(value!=='过道'||flag!=='过道')throw Error(`座位范围 ${cell.address}：过道不可修改，请到软件调整布局`);continue;}
    if(!['是','否','可选座位','固定空位'].includes(flag))throw Error(`座位范围 ${on.address}：请选择可选座位或固定空位`);
    if(value==='过道')throw Error(`座位范围 ${cell.address}：不能把座位改为过道，请到软件调整布局`);
    if(value==='固定空位')continue;
    if(value==='可选空位'){seats[key]='';continue;}
    if(/^固定[:：]/.test(value)){
      const name=value.replace(/^固定[:：]/,'').trim(),matches=students.filter(s=>name===s.number||name===`${s.number} ${s.name}`||name===s.name);
      if(matches.length!==1)throw Error(`座位范围 ${cell.address}：固定学生无法唯一匹配，请填写“固定：学号 姓名”`);
      const p=rules.students[matches[0].id];if(p.excluded)throw Error(`座位范围 ${cell.address}：该学生不在班，不能固定座位`);
      if(p.fixedSeat)throw Error(`座位范围 ${cell.address}：同一学生不能固定在多个位置`);
      p.fixed=true;p.fixedSeat=key;seats[key]=p.category;continue;
    }
    if(['否','固定空位'].includes(flag)&&value)throw Error(`座位范围 ${cell.address}：已填写范围，请选择可选座位，或填写固定空位`);
    if(['是','可选座位'].includes(flag))seats[key]=category(value,`座位范围 ${cell.address}`);

  }
  return seats;
}
module.exports={MARKER,LEGACY_MARKER,createGrid,parseGrid,rangeCell,participationCell};
