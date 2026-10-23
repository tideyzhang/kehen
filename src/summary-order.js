(function(root){
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
  function sort(rows,field='number',direction='asc'){
    const number=(a,b)=>collator.compare(a.number,b.number)||String(a.id).localeCompare(String(b.id));
    const value=r=>field==='minus'?Math.abs(r.minus):r[field];
    return [...rows].sort((a,b)=>{const comparison=field==='number'?number(a,b):value(a)-value(b);return comparison*(direction==='desc'?-1:1)||number(a,b);});
  }
  const api={sort};if(typeof module!=='undefined')module.exports=api;else root.summaryOrder=api;
})(typeof window!=='undefined'?window:globalThis);
