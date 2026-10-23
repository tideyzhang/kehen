(function(root){
  function resizeLayout(draft,rows,cols){
    if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows>20||cols>20)throw Error('行列数应为1至20');
    let rowIds=Array.from({length:draft.rows},(_,i)=>i),colIds=Array.from({length:draft.cols},(_,i)=>i);
    const emptyRow=r=>colIds.every(c=>!draft.layout[`${r},${c}`]);
    const emptyCol=c=>rowIds.every(r=>!draft.layout[`${r},${c}`]);
    // Stored rows ascend from the teacher-side bottom; remove empty rows there first, columns from the right.
    while(rowIds.length>rows){const index=rowIds.findIndex(emptyRow);if(index<0)throw Error(`无法缩为${rows}行：没有足够的整行空位。请先把要删除行的学生移走，并清空过道。`);rowIds.splice(index,1);}
    while(colIds.length>cols){let index=-1;for(let i=colIds.length-1;i>=0;i--)if(emptyCol(colIds[i])){index=i;break;}if(index<0)throw Error(`无法缩为${cols}列：没有足够的整列空位。请先把要删除列的学生移走，并清空过道。`);colIds.splice(index,1);}
    const offset=Math.max(0,rows-rowIds.length),layout={};
    rowIds.forEach((r,ri)=>colIds.forEach((c,ci)=>{const value=draft.layout[`${r},${c}`];if(value)layout[`${ri+offset},${ci}`]=value;}));
    return {...draft,rows,cols,layout};
  }
  if(typeof module!=='undefined')module.exports={resizeLayout};else root.seatLayout={resizeLayout};
})(typeof window!=='undefined'?window:globalThis);
