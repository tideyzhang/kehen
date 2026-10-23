const test=require('node:test'),assert=require('node:assert/strict'),{exportName}=require('../src/export-name.cjs');
test('export names distinguish local export time down to seconds and preserve filename/type',()=>{
 const date=new Date(2026,9,4,7,9,2);assert.equal(exportName('2407-当前座位','xlsx',date),'2407-当前座位-2026-10-04_07-09-02.xlsx');
 assert.equal(exportName('积分汇总','csv',new Date(2026,9,4,7,9,3)),'积分汇总-2026-10-04_07-09-03.csv');
 assert.equal(exportName('课堂积分备份','db',new Date(2026,11,31,23,59,59)),'课堂积分备份-2026-12-31_23-59-59.db');
});
test('class names with Windows-reserved path characters still produce a portable basename',()=>{
 const name=exportName('班级/一班:测试?','xlsx',new Date(2026,9,4));assert.equal(name,'班级-一班-测试--2026-10-04_00-00-00.xlsx');assert.equal(/[<>:"/\\|?*]/.test(name),false);
});
