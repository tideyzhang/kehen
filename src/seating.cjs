// The database row zero is nearest the bottom-stage teacher; columns run left to right.
function defaults(c,students){
  return {groups:Array.from({length:c.cols},(_,i)=>Math.floor(i/2)+1),seats:Object.fromEntries(Array.from({length:c.rows*c.cols},(_,i)=>`${Math.floor(i/c.cols)},${i%c.cols}`).filter(k=>c.layout[k]!=='aisle').map(k=>[k,''])),students:Object.fromEntries(students.map(s=>[s.id,{category:'',fixed:false,outerPriority:false}])),pairs:[],changeGroup:false,preferOuter:false};
}
function validate(c,students,rules,{checkCapacity=true}={}){
  const valid=new Set(students.map(s=>s.id));
  if(!rules||!Array.isArray(rules.groups)||rules.groups.length!==c.cols||rules.groups.some(g=>!Number.isInteger(g)||g<1||g>20))throw Error('每列需设置1至20的横向组号');
  for(let i=1;i<rules.groups.length;i++)if(rules.groups[i]<rules.groups[i-1]||rules.groups[i]>rules.groups[i-1]+1)throw Error('横向组须从左向右连续，不能交错或跳号');
  if(rules.groups[0]!==1)throw Error('横向组须从第1组开始');
  if(!rules.seats||typeof rules.seats!=='object'||!rules.students||!Array.isArray(rules.pairs))throw Error('排座规则不完整');
  const seats={};for(const [key,category] of Object.entries(rules.seats)){const [r,col]=key.split(',').map(Number);if(key!==`${r},${col}`||!Number.isInteger(r)||!Number.isInteger(col)||r<0||r>=c.rows||col<0||col>=c.cols||c.layout[key]==='aisle')throw Error('排座位置超出当前网格或位于过道，请重新设置规则');seats[key]=String(category).trim().slice(0,30);}
  if(checkCapacity&&!students.some(s=>s.active!==0&&!s.deleted_at&&!rules.students[s.id]?.excluded))throw Error('本轮没有参与学生，请在本轮人员中勾选学生');
  const people={},locked=new Set();for(const s of students){const p=rules.students[s.id]||{};people[s.id]={category:String(p.category||'').trim().slice(0,30),fixed:!!p.fixed,outerPriority:p.outerPriority===undefined?p.category==='3':!!p.outerPriority};
    if(p.excluded)people[s.id].excluded=true;
    const participating=s.active!==0&&!s.deleted_at&&!p.excluded;
    if(p.fixedSeat){if(participating&&checkCapacity&&!Object.hasOwn(seats,p.fixedSeat))throw Error(`${s.name} 的指定座位不参与编排`);people[s.id].fixedSeat=p.fixedSeat;people[s.id].fixed=true;}
    if(checkCapacity&&people[s.id].fixed&&participating){const key=p.fixedSeat||Object.keys(c.layout).find(k=>c.layout[k]===s.id);if(!key||!Object.hasOwn(seats,key))throw Error(`${s.name} 没有可锁定的当前座位`);if(locked.has(key))throw Error('多名学生不能固定在同一个座位');locked.add(key);}
  }
  if(checkCapacity&&Object.keys(seats).length<students.filter(s=>s.active!==0&&!s.deleted_at&&!people[s.id].excluded).length)throw Error(`座位少于参与学生：可用座位 ${Object.keys(seats).length} 个，参与学生 ${students.filter(s=>s.active!==0&&!s.deleted_at&&!people[s.id].excluded).length} 人；请增加可用座位或核对本轮人员`);
  const seen=new Set(),pairs=rules.pairs.map(pair=>{if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||pair.some(id=>!valid.has(id)))throw Error('配对请选择两名不同的本班学生');const key=[...pair].sort().join(':');if(seen.has(key))throw Error('配对规则重复');seen.add(key);return [...pair];});
  return {...(rules.version?{version:rules.version}:{}),groups:[...rules.groups],seats,students:people,pairs,changeGroup:!!rules.changeGroup,preferOuter:!!rules.preferOuter};
}
function shuffle(list,random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pairAllowed(a,b){return !((a.row===b.row&&Math.abs(a.group-b.group)<=1)||(a.group===b.group&&Math.abs(a.row-b.row)<=1));}
function generate(c,students,input,previous=c.layout,random=Math.random,checkOnly=false){
  const rules=validate(c,students,input),allIds=new Set(students.map(s=>s.id));students=students.filter(s=>s.active!==0&&!s.deleted_at&&!rules.students[s.id].excluded);const byId=new Map(students.map(s=>[s.id,s]));
  const seats=Object.entries(rules.seats).map(([key,category])=>{const [row,col]=key.split(',').map(Number);return {key,row,col,group:rules.groups[col],category};});
  const before=new Map();for(const [key,id] of Object.entries(previous)){if(id==='aisle'||allIds.has(id)&&!byId.has(id))continue;const [r,col]=key.split(',').map(Number);if(!byId.has(id)||before.has(id)||!Number.isInteger(r)||r<0||r>=c.rows||!Number.isInteger(col)||col<0||col>=c.cols)throw Error('上次座位与本班名单或当前网格不匹配');before.set(id,rules.groups[col]);}
  const newStudents=rules.changeGroup?students.filter(s=>!rules.students[s.id].fixed&&!before.has(s.id)).map(s=>s.name):[];
  const assigned=new Map(),occupied=new Set(),domains=new Map();
  const maxGroup=Math.max(...rules.groups),front=Math.max(1,Math.ceil(c.rows/2));
  const priority=s=>rules.preferOuter&&rules.students[s].outerPriority&&before.get(s)>1&&before.get(s)<maxGroup;
  const preference=(id,seat)=>priority(id)&&(seat.group===1||seat.group===maxGroup)?100+(seat.row<front?10:0):0;
  for(const s of students){const rule=rules.students[s.id],fixedKey=rule.fixed?(rule.fixedSeat||Object.keys(c.layout).find(k=>c.layout[k]===s.id)):null;
    const available=seats.filter(seat=>(!seat.category||seat.category===rule.category)&&(!fixedKey||seat.key===fixedKey)&&(!rules.changeGroup||rule.fixed||before.get(s.id)!==seat.group));
    if(!available.length)throw Error(`${s.name} 没有满足范围、固定及换组要求的座位`);domains.set(s.id,shuffle(available,random));
    if(fixedKey){assigned.set(s.id,available[0]);occupied.add(available[0]);}
  }
  const neighbors=new Map(students.map(s=>[s.id,[]]));rules.pairs.filter(([a,b])=>byId.has(a)&&byId.has(b)).forEach(([a,b])=>{neighbors.get(a).push(b);neighbors.get(b).push(a);});
  const allowed=(id,seat)=>neighbors.get(id).every(other=>!assigned.has(other)||pairAllowed(seat,assigned.get(other)));
  for(const [id,seat] of assigned)if(!allowed(id,seat))throw Error('固定座位与配对避邻规则冲突');
  // Rectangular Hungarian matching handles spare seats and soft preferences after hard constraints.
  function complete(weighted=false){
    const ids=shuffle(students.map(s=>s.id).filter(id=>!assigned.has(id)),random),available=shuffle(seats.filter(s=>!occupied.has(s)),random),n=ids.length,m=available.length;
    if(!n)return new Map();if(n>m)return null;
    const cost=ids.map(id=>available.map(seat=>domains.get(id).includes(seat)&&allowed(id,seat)?(weighted?-preference(id,seat):0):1000000));
    const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
    for(let i=1;i<=n;i++){p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;for(let j=1;j<=m;j++)if(!used[j]){const cur=cost[i0-1][j-1]-u[i0]-v[j];if(cur<min[j]){min[j]=cur;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}}for(let j=0;j<=m;j++){if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;}j0=j1;}while(p[j0]!==0);do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);}
    const result=new Map();for(let j=1;j<=m;j++)if(p[j]){if(cost[p[j]-1][j-1]===1000000)return null;result.set(ids[p[j]-1],available[j-1]);}return result;
  }
  if(!complete())throw Error('座位分区、固定或换组条件导致可用位置不足，请查看各分区人数和位置');
  if(checkOnly)return {participants:students.length,usable:seats.length,spare:seats.length-students.length,newStudents,pausedPairs:rules.pairs.filter(([a,b])=>!byId.has(a)||!byId.has(b)).length};
  let nodes=0;const deadline=Date.now()+2000;
  function solve(){
    if(++nodes>8000||Date.now()>deadline)throw Error('本次搜索达到上限，请再生成一次或减少冲突规则；正式座位未改变');
    const pending=shuffle(students.filter(s=>neighbors.get(s.id).length&&!assigned.has(s.id)),random);
    if(!pending.length){const rest=complete(true);return rest&&new Map([...assigned,...rest]);}
    const options=pending.map(s=>({id:s.id,seats:domains.get(s.id).filter(seat=>!occupied.has(seat)&&allowed(s.id,seat))})).sort((a,b)=>a.seats.length-b.seats.length);
    const next=options[0];if(!next.seats.length||!complete())return null;
    const candidates=shuffle(next.seats,random).sort((a,b)=>preference(next.id,b)-preference(next.id,a));
    for(const seat of candidates){assigned.set(next.id,seat);occupied.add(seat);const answer=solve();if(answer)return answer;assigned.delete(next.id);occupied.delete(seat);}return null;
  }
  const result=solve();if(!result)throw Error('当前范围、换组和配对规则无法同时满足；请调整规则，正式座位未改变');
  const layout=Object.fromEntries(Object.entries(c.layout).filter(([,v])=>v==='aisle'));for(const [id,seat] of result)layout[seat.key]=id;
  return {layout,newStudents,placed:result.size,priorityTotal:students.filter(s=>priority(s.id)).length,prioritySatisfied:[...result].filter(([id,seat])=>preference(id,seat)===110).length};
}
function preflight(c,students,rules,previous=c.layout){
  const participants=students.filter(s=>s.active!==0&&!s.deleted_at&&!rules.students?.[s.id]?.excluded),categories=[...new Set(participants.map(s=>rules.students?.[s.id]?.category||''))];
  const ranges=categories.map(category=>({category:category||'未指定分区',students:participants.filter(s=>(rules.students?.[s.id]?.category||'')===category).length,positions:Object.values(rules.seats||{}).filter(v=>!v||v===category).length}));
  try{return {ok:true,ranges,...generate(c,students,rules,previous,()=>0.5,true)};}catch(e){return {ok:false,ranges,errors:[e.message]};}
}
module.exports={defaults,validate,generate,pairAllowed,preflight};
