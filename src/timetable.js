(function(root){
  const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
  const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function minutes(time){if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('时间请使用 HH:MM');const [h,m]=time.split(':').map(Number);return h*60+m;}
  function validate(config,subjects){
    if(!config||!Array.isArray(config.periods)||config.periods.length>30)throw Error('每天最多设置30节课');
    const ids=new Set();let end=-1;
    const periods=config.periods.map(p=>{const start=minutes(p.start),stop=minutes(p.end);if(start>=stop||start<end)throw Error('课程时间须按先后排列，结束晚于开始且不能重叠');end=stop;
      if(typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error('课节编号无效或重复');ids.add(p.id);
      if(!Array.isArray(p.subjects)||p.subjects.length!==7)throw Error(`${p.label}：每节课需要周一至周日七天的安排，空白表示不上课`);
      const unknown=p.subjects.filter(s=>s!==''&&!subjects.includes(s));if(unknown.length)throw Error(`${p.label}：本班尚未启用科目：${[...new Set(unknown)].join('、')}`);
      return {id:p.id,label:String(p.label||'课节').slice(0,30),start:p.start,end:p.end,subjects:[...p.subjects]};});
    const overrides=(config.overrides||[]).map(o=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||isNaN(Date.parse(o.date))||new Date(o.date+'T12:00:00Z').toISOString().slice(0,10)!==o.date||!ids.has(o.periodId)||o.subject!==''&&!subjects.includes(o.subject))throw Error('调课日期、课节或科目无效');return {date:o.date,periodId:o.periodId,subject:o.subject};});
    if(new Set(overrides.map(o=>o.date+':'+o.periodId)).size!==overrides.length)throw Error('同一天同一课节不能重复调课');
    return {periods,overrides};
  }
  function onDate(config,date){const key=dateKey(date),weekday=(date.getDay()+6)%7;return (config?.periods||[]).map(p=>{const override=(config.overrides||[]).find(o=>o.date===key&&o.periodId===p.id);return {...p,subject:override?override.subject:p.subjects[weekday],date:key,key:key+':'+p.id,temporary:!!override};}).filter(p=>p.subject);}
  function status(config,date=new Date()){
    const today=onDate(config,date),n=date.getHours()*60+date.getMinutes()+date.getSeconds()/60;
    const current=today.find(p=>minutes(p.start)<=n&&n<minutes(p.end))||null;
    let next=today.find(p=>minutes(p.start)>n)||null;
    if(!next)for(let i=1;i<=7;i++){const d=new Date(date);d.setDate(d.getDate()+i);const first=onDate(config,d)[0];if(first){next=first;break;}}
    const target=current?new Date(current.date+'T'+current.end+':00'):next?new Date(next.date+'T'+next.start+':00'):null;
    return {today,current,next,seconds:target?Math.max(0,Math.ceil((target-date)/1000)):null};
  }
  const api={weekdays,dateKey,minutes,validate,onDate,status};if(typeof module!=='undefined')module.exports=api;else root.timetable=api;
})(typeof window!=='undefined'?window:globalThis);
