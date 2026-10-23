// Labels belong to seating only. Student IDs and score history never change.
const label=s=>s.seatName||s.name;
function matches(value,students){const exact=students.filter(s=>label(s)===value);return exact.length?exact:students.filter(s=>s.name===value||s.number===value||`${s.number} ${s.name}`===value);}
function resolve(value,students,where,choices={}){
  const found=matches(value,students);if(found.length===1)return found[0];
  if(found.length>1){const selected=found.find(s=>s.id===choices[where]);if(selected)return selected;const error=Error(`${where}：${value} 有重名，请核对对应学生`);error.nameConflict={where,value,candidates:found.map(s=>({id:s.id,name:s.name,number:s.number,active:s.active}))};throw error;}
  return null;
}
module.exports={label,matches,resolve};
