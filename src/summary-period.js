(function(root){
  const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function range(period,{sessionId,from,to}={},clock=new Date()){
    if(period==='session')return {sessionId:sessionId||'none'};
    if(period==='all')return {};
    if(period==='today'){
      const start=new Date(clock.getTime()-24*60*60*1000);
      return {fromInstant:start.toISOString(),toInstant:clock.toISOString(),fallbackFromDate:day(start),fallbackToDate:day(clock)};
    }
    if(period==='month')return {from:day(new Date(clock.getFullYear(),clock.getMonth(),1)),to:day(clock)};
    if(period==='week'){
      const start=new Date(clock.getFullYear(),clock.getMonth(),clock.getDate()-(clock.getDay()+6)%7);
      return {from:day(start),to:day(clock)};
    }
    return {from:from||day(clock),to:to||day(clock)};
  }
  function matches(row,filter,sessions){
    if(filter.sessionId&&row.session_id!==filter.sessionId)return false;
    if(filter.from&&row.date<filter.from||filter.to&&row.date>filter.to)return false;
    if(filter.fromInstant){
      const start=row.session_id?sessions.get(row.session_id)?.start:null;
      if(start){if(start<filter.fromInstant||start>filter.toInstant)return false;}
      else if(row.date<filter.fallbackFromDate||row.date>filter.fallbackToDate)return false;
    }
    if(filter.subject&&row.subject!==filter.subject)return false;
    if(filter.academic&&!row.subject)return false;
    return true;
  }
  const api={range,matches};if(typeof module!=='undefined')module.exports=api;else root.summaryPeriod=api;
})(typeof window!=='undefined'?window:globalThis);
