const Excel=require('exceljs'),visualGrid=require('../../src/seat-rules-grid.cjs');
const enabledPriority=p=>p.outerPriority===undefined?p.category==='3':!!p.outerPriority;
function rangeLabels(rules){const values=new Set([...Object.values(rules.seats),...Object.values(rules.students).map(p=>p.category)].filter(Boolean)),used=new Set(values),labels=new Map();for(const value of values){let label=value;if(/^\d+$/.test(value)){label='原范围'+value;while(used.has(label))label='原'+label;used.add(label);}labels.set(value,label);}return labels;}
function createLegacyRulesWorkbook(c,students,rules){
  const wb=new Excel.Workbook(),labels=rangeLabels(rules),label=v=>labels.get(v)||v||'';
  visualGrid.createGrid(wb,c,students,rules,label);
  const roster=wb.addWorksheet('学生安排');roster.addRow(['学号','姓名','座位范围','固定当前座位','轮换前部优先','在班状态']);
  for(const s of students){const p=rules.students[s.id]||{};const row=roster.addRow([s.number,s.name,label(p.category),p.fixed&&!p.fixedSeat?'是':'否',enabledPriority(p)?'是':'否',p.excluded?'不在班':'在班']);row.getCell(6).dataValidation={type:'list',allowBlank:false,formulae:['"在班,不在班"']};row.getCell(1).numFmt='@';for(const col of [4,5])row.getCell(col).dataValidation={type:'list',allowBlank:true,formulae:['"是,否"']};}
  roster.getColumn(4).hidden=true; // Legacy current-seat flag; new fixed targets are entered on the grid.
  const groups=wb.addWorksheet('横向分组');groups.addRow(['列（从左起）','横向组号']);for(let i=0;i<c.cols;i++)groups.addRow([i+1,rules.groups[i]]);
  const byId=new Map(students.map(s=>[s.id,s])),pairs=wb.addWorksheet('配对避邻');pairs.addRow(['学号1','姓名1','学号2','姓名2']);for(const [a,b] of rules.pairs)pairs.addRow([byId.get(a)?.number||'',byId.get(a)?.name||'',byId.get(b)?.number||'',byId.get(b)?.name||'']);
  for(const ws of wb.worksheets.filter(ws=>ws.name!=='座位范围')){ws.columns.forEach(c=>c.width=22);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF286458'}};ws.views=[{state:'frozen',ySplit:1}];}
  const help=wb.addWorksheet('填写说明');help.getColumn(1).width=110;
  [ `${c.name} · 排座规则模板（${c.rows}排 × ${c.cols}列）`,
    '本文件包含学生安排、座位范围、横向分组和配对避邻。导入后仅显示条数，不在软件页面显示学生所属范围、固定名单或配对名单。请妥善保存本文件。',
    '学生安排：每位在班学生保留一行。学号采用文本格式，保留前导零；姓名用于交叉核对。不要遗漏、重复或增添其他班级学生。',
    '座位范围用老师自定义名称，例如“前部区”“中部区”“靠窗区”。这些名称不是成绩分类，也不会自动对应某个位置：实际位置在“座位范围”左上网格中划定，右侧显示现有学生及所属范围。',
    '匹配规则：座位范围留空表示该座位不限学生；座位填写范围名称时，只能安排“学生安排”中同名范围的学生。学生范围留空只可使用不限范围的座位。',
    '旧版数字类别在模板中改为“原范围1”等名称，保留原有匹配关系，不意味着前、中、后排。若重命名，请在学生安排与座位范围两张表中同步修改。',
    '网格可填写固定空位（始终留空）、可选空位（不限范围，可坐可空）或固定：学号 姓名（直接指定目标座位）。范围格配合下方可选座位使用，允许范围座位数多于对应学生数。',
    '学生安排的在班状态填不在班后，不参与排座及配对限制，名单和积分仍保留。返班时改回在班；相对上次换组需要该生上次位置，缺少时请补充上次结果或关闭换组。',
    '固定当前座位：填“是”会锁定学生在软件当前已保存的座位，须已有座位且该位置参与编排。固定不豁免座位范围与配对避邻，但豁免相对上次换组。',
    '轮换前部优先：为需要轮换照顾的学生填写“是”。页面开启相应选项后，只有上次在中间横向组的这些学生，才优先左右最外组及靠讲台的一半排数；这是可让步的偏好。此标记与座位范围互相独立。',
    '座位范围：左上网格与当前座位同尺寸，第1排靠下方讲台，列从左向右。选择一片格子批量填写同名范围划定区域；下方网格选择可选座位或固定空位。过道不可修改，颜色和边框不作为规则。右侧参考随学生安排更新。',
    '横向分组：每列填组号，从左向右由1开始连续编号。同组通常包含一张桌子的两列；请按实际布局填写。',
    '配对避邻：每行一对，填写两人的学号与姓名。避免同排同组、同排相邻组、同组前后相邻排。允许一人出现在不同配对中，不允许自身配对或重复同一对。删除一行即取消该对；无配对时仅保留表头。',
    '页面保留换组和轮换前部优先总开关。Excel不更改这两个开关；导入只产生规则草稿，点击保存规则或应用生成结果后保存。',
    '禁止合并单元格或修改表头。可先下载已有规则模板修改，再导入；错误会整份拒绝，不会覆盖原规则。设置的可选座位须不少于参与排座学生。'
  ].forEach(t=>{const row=help.addRow([t]);row.height=45;row.alignment={wrapText:true,vertical:'middle'};});
  return wb;
}
module.exports={createRulesWorkbook:createLegacyRulesWorkbook};
