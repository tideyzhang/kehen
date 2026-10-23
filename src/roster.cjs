function nextNumber(students){const numbers=students.map(s=>String(s.number)).filter(n=>/^\d+$/.test(n));const max=numbers.reduce((a,n)=>BigInt(n)>a?BigInt(n):a,0n);return String(max+1n).padStart(numbers.reduce((n,s)=>Math.max(n,s.length),1),'0');}
module.exports={nextNumber};
