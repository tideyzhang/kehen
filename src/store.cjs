const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt, createHash } = require('node:crypto');
const initSql = require('sql.js');
const {nextNumber}=require('./roster.cjs');
const timetable=require('./timetable.js');const seating=require('./seating.cjs');
const SUBJECTS = ['语文','数学','英语','物理','化学','生物','政治','历史','地理'];
const id = () => randomUUID();
const now = () => new Date().toISOString();
const naturalOrder = new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
const EVENT_KINDS=['缺席','迟到','睡觉','上厕所'];
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function day(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function checkIntegrity(db) {
  if(db.exec('PRAGMA integrity_check')[0]?.values[0][0]!=='ok')throw Error('数据库文件损坏');
  if(db.exec('PRAGMA foreign_key_check').length)throw Error('数据库关联记录不完整');
}
function cents(value) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(String(value).trim())) throw Error('分值必须是最多两位小数的数字');
  const n = Math.round(Number(value)*100);
  if (!Number.isSafeInteger(n) || Math.abs(n)>10000000) throw Error('单笔分值超出范围');
  return n;
}
class Store {
  static async open(file) {
    const SQL = await initSql();
    const s = new Store(); s.SQL=SQL; s.file=file;
    s.db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    if(fs.existsSync(file))try{checkIntegrity(s.db);}catch(e){s.db.close();throw Error(`原数据文件已保留，无法打开：${e.message}`);}
    s.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,rows INTEGER DEFAULT 8,cols INTEGER DEFAULT 8,subjects TEXT NOT NULL,layout TEXT DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),number TEXT NOT NULL,name TEXT NOT NULL,active INTEGER DEFAULT 1,UNIQUE(class_id,number));
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,class_id TEXT NOT NULL REFERENCES classes(id),subject TEXT NOT NULL,start TEXT NOT NULL,end TEXT,absent TEXT DEFAULT '[]');
      CREATE UNIQUE INDEX IF NOT EXISTS one_active ON sessions((1)) WHERE end IS NULL;
      CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,created TEXT NOT NULL,label TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id),session_id TEXT REFERENCES sessions(id),subject TEXT,date TEXT NOT NULL,amount INTEGER NOT NULL,category TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL,reversal_of TEXT UNIQUE REFERENCES points(id),batch_id TEXT REFERENCES batches(id));
      CREATE TABLE IF NOT EXISTS draws(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),student_id TEXT NOT NULL REFERENCES students(id),created TEXT NOT NULL);`);
    if (!s.get('subjects')) s.set('subjects', SUBJECTS);
    if (!s.get('scores')) s.set('scores', [-1,1,2,3,5]);
    s.migrateEvents();s.migrateRosterScores();s.save(); s.backup('daily',true); return s;
  }
  migrateEvents(){
    if(this.one("SELECT name FROM sqlite_master WHERE type='table' AND name='class_events'")){
      if(!this.all('PRAGMA table_info(class_events)').some(c=>c.name==='lesson')){this.backup('before-0.4-upgrade');this.run("ALTER TABLE class_events ADD COLUMN lesson TEXT NOT NULL DEFAULT ''");}return;
    }
    if(fs.existsSync(this.file))this.backup('before-events-upgrade');
    this.run(`CREATE TABLE class_events(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id),session_id TEXT REFERENCES sessions(id),subject TEXT NOT NULL,date TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL,voided_at TEXT)`);
    for(const session of this.all('SELECT * FROM sessions'))for(const student of JSON.parse(session.absent))this.run('INSERT INTO class_events VALUES (?,?,?,?,?,?,?,?,NULL)',[id(),student,session.id,session.subject,day(new Date(session.start)),'缺席','从旧版缺席状态迁移',session.start]);
    this.run("ALTER TABLE class_events ADD COLUMN lesson TEXT NOT NULL DEFAULT ''");
  }
  migrateRosterScores(){
    const studentColumn=this.all('PRAGMA table_info(students)').some(c=>c.name==='deleted_at'),eventColumn=this.all('PRAGMA table_info(class_events)').some(c=>c.name==='point_id');
    if(studentColumn&&eventColumn)return;
    if(fs.existsSync(this.file))this.backup('before-0.5-upgrade');
    if(!studentColumn)this.run('ALTER TABLE students ADD COLUMN deleted_at TEXT');
    if(!eventColumn)this.run('ALTER TABLE class_events ADD COLUMN point_id TEXT REFERENCES points(id)');
  }
  all(sql, args=[]) { const st=this.db.prepare(sql); try { st.bind(args);const out=[];while(st.step())out.push(st.getAsObject());return out; } finally { st.free(); } }
  one(sql,args=[]) { return this.all(sql,args)[0]; }
  run(sql,args=[]) { this.db.run(sql,args); }
  get(key) { const row=this.one('SELECT value FROM settings WHERE key=?',[key]);return row?JSON.parse(row.value):null; }
  set(key,value) { this.run('INSERT OR REPLACE INTO settings VALUES (?,?)',[key,JSON.stringify(value)]); }
  // Windows requires write access on the handle passed to fsync (FlushFileBuffers).
  exportBytes() { try{return this.db.export();}finally{this.run('PRAGMA foreign_keys=ON');} }
  save() { fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,this.exportBytes()); const fd=fs.openSync(temp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,this.file); }
  tx(fn) { const before=this.exportBytes();this.run('BEGIN');try { const result=fn();this.run('COMMIT');this.save();return result; } catch(e) { this.db.close();this.db=new this.SQL.Database(before);this.run('PRAGMA foreign_keys=ON');throw e; } }
  backup(label='manual',daily=false) {
    const folder=path.join(path.dirname(this.file),'backups');fs.mkdirSync(folder,{recursive:true});
    if(daily && fs.readdirSync(folder).some(n=>n.startsWith(`${day()}-daily`)))return;
    const bytes=this.exportBytes();let stamp=Date.now(),target;
    for(;;){
      target=path.join(folder,`${day()}-${label}-${stamp}.db`);
      try{fs.writeFileSync(target,bytes,{flag:'wx'});break;}catch(e){
        if(e.code==='EEXIST'){stamp++;continue;}
        if(fs.existsSync(target))fs.unlinkSync(target);throw e;
      }
    }
    let verified;
    try{verified=new this.SQL.Database(fs.readFileSync(target));checkIntegrity(verified);}
    catch(e){fs.unlinkSync(target);throw e;}finally{verified?.close();}
    const files=fs.readdirSync(folder).filter(n=>n.endsWith('.db')&&path.join(folder,n)!==target).map(name=>({name,time:Number(name.match(/-(\d+)\.db$/)?.[1]??fs.statSync(path.join(folder,name)).mtimeMs)})).sort((a,b)=>b.time-a.time||b.name.localeCompare(a.name));
    for(const entry of files.slice(29))fs.unlinkSync(path.join(folder,entry.name));return target;
  }
  restore(bytes) {
    const next=new this.SQL.Database(bytes);
    try {
      checkIntegrity(next);
      for(const table of ['settings','classes','students','sessions','points','batches','draws'])next.exec(`SELECT * FROM ${table} LIMIT 1`);
      if(next.exec('PRAGMA foreign_key_check').length)throw Error('备份关联记录不完整');
      if(next.exec('SELECT count(*) FROM sessions WHERE end IS NULL')[0].values[0][0]>1)throw Error('备份课次状态错误');
    }catch(e){next.close();throw Error('不是有效的课痕备份：'+e.message);}
    this.backup('before-restore');const old=this.db;this.db=next;this.run('PRAGMA foreign_keys=ON');try{this.migrateEvents();this.migrateRosterScores();this.save();old.close();}catch(e){this.db=old;next.close();throw e;}
  }
  snapshot() { return {classes:this.all('SELECT * FROM classes ORDER BY name').map(c=>({...c,subjects:JSON.parse(c.subjects),layout:JSON.parse(c.layout)})),students:this.all('SELECT * FROM students').sort((a,b)=>naturalOrder.compare(a.number,b.number)||a.number.localeCompare(b.number)||a.id.localeCompare(b.id)),sessions:this.all('SELECT * FROM sessions ORDER BY start DESC').map(s=>({...s,absent:JSON.parse(s.absent)})),eventKinds:this.get('eventKinds')??EVENT_KINDS,setup:this.get('setup')||{},subjects:this.get('subjects'),scores:this.get('scores'),timetables:this.get('timetables')||{},seatNames:this.get('seatNames')||{},seatRules:this.get('seatRules')||{},seatHistory:this.get('seatHistory')||{},scheduleSession:this.get('scheduleSession'),scheduleFollow:this.get('scheduleFollow')}; }
  active() { return this.one('SELECT * FROM sessions WHERE end IS NULL'); }
  command(action,p={}) {
    if(['deleteClass','deleteStudent','syncSeatRoster','reviewLegacySeatRules'].includes(action))this.backup(action==='deleteClass'?'before-delete-class':action==='deleteStudent'?'before-delete-student':'before-seat-roster');
    if(['seatRules','applySeating'].includes(action)&&p.rules?.version===4&&this.get('seatRules')?.[p.classId]&&!this.get('seatRules')[p.classId].version)this.backup('before-seat-rules-v4');
    return this.tx(()=>{
      if(action==='scheduleFollow'){if(p.classId&&!this.one('SELECT id FROM classes WHERE id=?',[p.classId]))throw Error('请选择班级');if(this.active()&&p.classId&&this.active().class_id!==p.classId)throw Error('请先结束当前课堂再切换跟课班级');this.set('scheduleFollow',p.classId||null);return;}
      if(action==='timetable'){
        const c=this.one('SELECT * FROM classes WHERE id=?',[p.classId]);if(!c)throw Error('请选择班级');
        const enabled=JSON.parse(c.subjects),extra=p.enableNewSubjects?[...new Set([...(p.config?.periods||[]).flatMap(x=>Array.isArray(x.subjects)?x.subjects:[]),...(p.config?.overrides||[]).map(x=>x.subject)].filter(x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=50))]:[];
        const subjects=[...new Set([...enabled,...extra])],config=timetable.validate(p.config,subjects),all=this.get('timetables')||{};
        if(p.enableNewSubjects){this.set('subjects',[...new Set([...this.get('subjects'),...extra])]);this.run('UPDATE classes SET subjects=? WHERE id=?',[JSON.stringify(subjects),c.id]);}
        all[c.id]=config;this.set('timetables',all);return;
      }
      if(action==='seatNames'){
        const people=this.all('SELECT * FROM students WHERE class_id=?',[p.classId]),names=this.get('seatNames')||{},proposed={...names};
        for(const [id,value] of Object.entries(p.names||{})){if(!people.some(s=>s.id===id))throw Error('学生不存在');const name=String(value).trim();if(name.length>50||['过道','留空','通用'].includes(name))throw Error('显示名最长50字，不能使用过道、留空或通用');if(name)proposed[id]=name;else delete proposed[id];}
        for(const s of people)if(proposed[s.id]&&people.some(other=>other.id!==s.id&&(other.name===proposed[s.id]||(proposed[other.id]||other.name)===proposed[s.id])))throw Error('座位显示名与其他学生重复');
        this.set('seatNames',proposed);return;
      }
      if(action==='reviewLegacySeatRules'){
        if(this.active())throw Error('请先结束课堂再核对旧版状态');
        const snap=this.snapshot(),c=snap.classes.find(c=>c.id===p.classId);if(!c)throw Error('请选择班级');
        const people=snap.students.filter(s=>s.class_id===c.id),rules=structuredClone(p.rules),layout={...c.layout};
        for(const student of people)if(rules.students[student.id]?.excluded){const choice=p.decisions?.[student.id];if(!['inactive','round','resume'].includes(choice))throw Error('请逐项选择旧版不在班标记的处理方式');if(choice==='inactive'){this.run('UPDATE students SET active=0 WHERE id=?',[student.id]);for(const key of Object.keys(layout))if(layout[key]===student.id)delete layout[key];}delete rules.students[student.id].excluded;}
        rules.version=4;const all=this.get('seatRules')||{};all[c.id]=seating.validate({...c,layout},people,rules,{checkCapacity:false});this.set('seatRules',all);this.run('UPDATE classes SET layout=? WHERE id=?',[JSON.stringify(layout),c.id]);return;
      }
      if(action==='seatRules'){
        const snap=this.snapshot(),c=snap.classes.find(c=>c.id===p.classId);if(!c)throw Error('请选择班级');
        const rules=seating.validate(c,snap.students.filter(s=>s.class_id===c.id),p.rules,{checkCapacity:false}),all=this.get('seatRules')||{};all[c.id]=rules;this.set('seatRules',all);return;
      }
      if(action==='class') {
        if(!String(p.name||'').trim())throw Error('请输入班级名称');const cid=id();this.run('INSERT INTO classes(id,name,subjects) VALUES (?,?,?)',[cid,p.name.trim(),JSON.stringify(this.get('subjects'))]);return cid;
      }
      if(['addStudent','deleteStudent','deleteClass','syncSeatRoster'].includes(action)){
        const student=action==='deleteStudent'?this.one('SELECT * FROM students WHERE id=? AND deleted_at IS NULL',[p.id]):null;
        const c=this.one('SELECT * FROM classes WHERE id=?',[student?.class_id||p.classId]);if(!c)throw Error('班级或学生不存在');
        if(this.active()?.class_id===c.id)throw Error('请先结束本班课堂再调整名单');
        if(action==='addStudent'){
          const name=String(p.name||'').trim(),number=String(p.number||'').trim()||nextNumber(this.all('SELECT number FROM students WHERE class_id=?',[c.id]));
          if(!name||name.length>50||number.length>50)throw Error('请输入姓名，姓名和学号最长50字');
          if(this.one('SELECT id FROM students WHERE class_id=? AND number=?',[c.id,number]))throw Error('学号已使用（包括已删除学生），请换一个学号');
          const sid=id();this.run('INSERT INTO students(id,class_id,number,name) VALUES (?,?,?,?)',[sid,c.id,number,name]);return sid;
        }
        if(action==='deleteStudent'){
          this.run('UPDATE students SET active=0,deleted_at=? WHERE id=?',[now(),student.id]);const layout=JSON.parse(c.layout);for(const key of Object.keys(layout))if(layout[key]===student.id)delete layout[key];this.run('UPDATE classes SET layout=? WHERE id=?',[JSON.stringify(layout),c.id]);return;
        }
        if(action==='deleteClass'){
          const seatNames=this.get('seatNames')||{};for(const s of this.all('SELECT id FROM students WHERE class_id=?',[c.id]))delete seatNames[s.id];this.set('seatNames',seatNames);
          this.run('DELETE FROM class_events WHERE student_id IN (SELECT id FROM students WHERE class_id=?)',[c.id]);
          this.run('DELETE FROM draws WHERE session_id IN (SELECT id FROM sessions WHERE class_id=?) OR student_id IN (SELECT id FROM students WHERE class_id=?)',[c.id,c.id]);
          this.run('DELETE FROM points WHERE student_id IN (SELECT id FROM students WHERE class_id=?)',[c.id]);
          this.run('DELETE FROM sessions WHERE class_id=?',[c.id]);this.run('DELETE FROM students WHERE class_id=?',[c.id]);this.run('DELETE FROM classes WHERE id=?',[c.id]);
          for(const key of ['timetables','seatRules','seatHistory','setup','scheduleSkipped']){const values=this.get(key)||{};delete values[c.id];this.set(key,values);}
          if(this.get('scheduleFollow')===c.id)this.set('scheduleFollow',null);if(this.get('scheduleSession')?.classId===c.id)this.set('scheduleSession',null);return;
        }
        const before=this.all('SELECT * FROM students WHERE class_id=?',[c.id]);
        if(p.fingerprint!==JSON.stringify([c,before]))throw Error('名单或座位已改变，请重新导入预览');
        if(!Number.isInteger(p.rows)||!Number.isInteger(p.cols)||p.rows<1||p.cols<1||p.rows>20||p.cols>20)throw Error('行列数应为1至20');
        if(p.syncRoster===false&&((p.additions||[]).length||Object.values(p.layout||{}).some(id=>id!=='aisle'&&!before.some(s=>s.id===id&&s.active&&!s.deleted_at))))throw Error('仅更新座位不能新增或恢复学生，请选择同步名单');
        const valid=new Set(before.map(s=>s.id)),numbers=new Set(before.map(s=>s.number));
        for(const st of p.additions||[]){if(!st.id||valid.has(st.id)||numbers.has(st.number)||!st.name?.trim()||st.name.length>50||st.number!==nextNumber([...before,...(p.additions||[]).slice(0,(p.additions||[]).indexOf(st))]))throw Error('新增学生预览无效，请重新导入');valid.add(st.id);numbers.add(st.number);this.run('INSERT INTO students(id,class_id,number,name) VALUES (?,?,?,?)',[st.id,c.id,st.number,st.name]);}
        const placed=new Set();for(const [key,sid] of Object.entries(p.layout||{})){const [r,col]=key.split(',').map(Number);if(!/^\d+,\d+$/.test(key)||r>=p.rows||col>=p.cols)throw Error('座位超出布局');if(sid==='aisle')continue;if(!valid.has(sid)||placed.has(sid))throw Error('学生无效或重复');placed.add(sid);}
        if(!placed.size)throw Error('座位表至少需要一名学生，不能用空表停用全班');
        if(p.syncRoster!==false){this.run('UPDATE students SET active=0 WHERE class_id=?',[c.id]);for(const sid of placed)this.run('UPDATE students SET active=1,deleted_at=NULL WHERE id=?',[sid]);}
        this.run('UPDATE classes SET rows=?,cols=?,layout=? WHERE id=?',[p.rows,p.cols,JSON.stringify(p.layout),c.id]);return {added:(p.additions||[]).length,disabled:p.syncRoster===false?0:before.filter(s=>s.active&&!placed.has(s.id)).length};
      }
      if(action==='eventKinds'){
        if(!Array.isArray(p.kinds)||p.kinds.some(k=>typeof k!=='string'||!k.trim()||k.trim().length>30))throw Error('情况名称应为1至30个字');
        const kinds=p.kinds.map(k=>k.trim());if(new Set(kinds).size!==kinds.length)throw Error('情况名称不能重复');this.set('eventKinds',kinds);return;
      }
      if(action==='recordEventBatch')return this.recordEventBatch(p);
      if(action==='settings') {
        if(!Array.isArray(p.scores)||!p.scores.length||new Set(p.scores.map(cents)).size!==p.scores.length)throw Error('请至少设置一个分值，各分值不能重复');
        const subjects=[...new Set(p.subjects.map(s=>String(s).trim()).filter(Boolean))];if(!subjects.length)throw Error('至少保留一个科目');
        const used=this.all('SELECT DISTINCT subject FROM sessions UNION SELECT DISTINCT subject FROM points WHERE subject IS NOT NULL UNION SELECT DISTINCT subject FROM class_events').map(r=>r.subject);
        if(used.some(s=>!subjects.includes(s)))throw Error('已有记录的科目请在班级设置中停用，不能从科目库删除');
        const referenced=this.all('SELECT name,subjects FROM classes').filter(c=>JSON.parse(c.subjects).some(s=>!subjects.includes(s)));
        if(referenced.length)throw Error(`科目仍被班级启用，请先在“本班科目”取消勾选：${referenced.map(c=>c.name).join('、')}`);
        this.set('scores',p.scores.map(v=>cents(v)/100));this.set('subjects',subjects);return;
      }
      if(action==='layout'||action==='applySeating') {
        const c=this.one('SELECT * FROM classes WHERE id=?',[p.classId]);if(!c)throw Error('请选择班级');
        if(action==='applySeating'&&this.active())throw Error('请先结束课堂再应用座位');
        if(!Number.isInteger(p.rows)||!Number.isInteger(p.cols)||p.rows<1||p.cols<1||p.rows>20||p.cols>20)throw Error('行列数应为1至20');
        const students=new Set(this.all('SELECT id FROM students WHERE class_id=? AND active=1',[c.id]).map(s=>s.id));const placed=new Set();
        for(const [key,value] of Object.entries(p.layout)) { const [r,col]=key.split(',').map(Number);if(!Number.isInteger(r)||!Number.isInteger(col)||r<0||col<0||r>=p.rows||col>=p.cols)throw Error('座位超出布局');if(value==='aisle')continue;if(!students.has(value)||placed.has(value))throw Error('座位学生无效或重复');placed.add(value); }
        const subjects=p.subjects.filter(s=>this.get('subjects').includes(s));if(!subjects.length)throw Error('本班至少启用一个科目');
        const plan=(this.get('timetables')||{})[c.id];if(plan)timetable.validate(plan,subjects);
        const a=this.active();if(a?.class_id===c.id&&!subjects.includes(a.subject))throw Error('不能停用正在上课的科目');
        if(action==='applySeating'){if(p.rules){const allRules=this.get('seatRules')||{};allRules[c.id]=p.rules;this.set('seatRules',allRules);}const all=this.get('seatHistory')||{},history=all[c.id]||[];history.unshift({id:id(),created:now(),label:'应用前',rows:c.rows,cols:c.cols,layout:JSON.parse(c.layout)},{id:id(),created:now(),label:'已采用',rows:p.rows,cols:p.cols,layout:p.layout});all[c.id]=history.slice(0,40);this.set('seatHistory',all);}
        this.run('UPDATE classes SET rows=?,cols=?,layout=?,subjects=? WHERE id=?',[p.rows,p.cols,JSON.stringify(p.layout),JSON.stringify(subjects),c.id]);if(p.confirmSubjects){const setup=this.get('setup')||{};setup[c.id]={...setup[c.id],subjects:true};this.set('setup',setup);}return;
      }
      if(action==='start'||action==='startScheduled') {
        if(action==='startScheduled'){const course=timetable.status((this.get('timetables')||{})[p.classId]).current;if(!course||course.key!==p.key)throw Error('当前课表已变化或尚未到上课时间，请刷新后重试');p={...p,subject:course.subject};}
        if(this.active())throw Error('请先结束当前课堂');const c=this.one('SELECT * FROM classes WHERE id=?',[p.classId]);if(!c||!JSON.parse(c.subjects).includes(p.subject)||!this.get('subjects').includes(p.subject))throw Error('请选择科目库中存在且本班启用的科目');
        const sid=id();this.run('INSERT INTO sessions(id,class_id,subject,start) VALUES (?,?,?,?)',[sid,c.id,p.subject,now()]);const course=timetable.status((this.get('timetables')||{})[c.id]).current;this.set('scheduleSession',course&&course.subject===p.subject?{sessionId:sid,classId:c.id,key:course.key,end:course.date+'T'+course.end+':00'}:null);return sid;
      }
      if(action==='end') { const a=this.active();if(!a)throw Error('当前没有进行中的课堂');if(p.sessionId!==undefined&&p.sessionId!==a.id)throw Error('课次已切换，请重新确认');const link=this.get('scheduleSession');if(link?.sessionId===a.id){const skipped=this.get('scheduleSkipped')||{};skipped[a.class_id]=link.key;this.set('scheduleSkipped',skipped);}this.run('UPDATE sessions SET end=? WHERE id=?',[now(),a.id]);return a.id; }
      if(action==='recordEvents'){
        if(!Array.isArray(p.ids)||!p.ids.length)throw Error('请选择课堂情况及至少一位学生');
        return this.recordEventBatch({...p,entries:[...new Set(p.ids)].map(studentId=>({studentId,kind:p.kind,note:p.notes?.[studentId]??p.note??''}))});
      }
      if(action==='voidEvent'){
        const row=this.one('SELECT * FROM class_events WHERE id=? AND voided_at IS NULL',[p.id]);if(!row)throw Error('记录不存在或已撤销');
        if(row.point_id&&!this.one('SELECT id FROM points WHERE reversal_of=?',[row.point_id]))this.reverse(row.point_id);this.run('UPDATE class_events SET voided_at=? WHERE id=?',[now(),p.id]);if(row.kind==='缺席'&&row.session_id)this.syncAbsence(row.session_id);return;
      }
      if(action==='absent') {
        const a=this.active();if(!a)throw Error('请先开始课堂');const valid=this.all('SELECT id FROM students WHERE class_id=?',[a.class_id]).map(s=>s.id);
        if(p.ids.some(x=>!valid.includes(x)))throw Error('学生不属于本班');this.run('UPDATE sessions SET absent=? WHERE id=?',[JSON.stringify([...new Set(p.ids)]),a.id]);return;
      }
      if(action==='draw') {
        const a=this.active();if(!a)throw Error('请先点击学科开始');const absent=JSON.parse(a.absent);const pool=this.all('SELECT * FROM students WHERE class_id=? AND active=1',[a.class_id]).filter(s=>!absent.includes(s.id));if(!pool.length)throw Error('没有可抽取的到场学生');const student=pool[randomInt(pool.length)];this.run('INSERT INTO draws VALUES (?,?,?,?)',[id(),a.id,student.id,now()]);return student.id;
      }
      if(action==='backfillScore'||action==='backfillScoreBatch'){
        if(!validDate(p.date)||p.date>day()||!this.get('subjects').includes(p.subject))throw Error('请选择今天或以前的有效日期和科目');
        const entries=action==='backfillScoreBatch'?p.entries:[{studentId:p.studentId,value:p.value,note:p.note||''}];
        if(!Array.isArray(entries)||!entries.length)throw Error('请选择至少一位学生');
        if(new Set(entries.map(e=>e.studentId)).size!==entries.length)throw Error('同批学生不能重复');
        if(p.sessionId){const ss=this.one('SELECT * FROM sessions WHERE id=?',[p.sessionId]);if(!ss||ss.class_id!==p.classId||ss.subject!==p.subject||day(new Date(ss.start))!==p.date)throw Error('所选课次与班级、日期或科目不一致');}
        for(const entry of entries){const st=this.one('SELECT * FROM students WHERE id=?',[entry.studentId]);if(!st||st.class_id!==p.classId||!st.active)throw Error('请选择本班在班学生');if(typeof entry.note!=='string'||entry.note.length>500)throw Error('个人备注不能超过500字');cents(entry.value);}
        for(const entry of entries)this.addPoint(entry.studentId,p.sessionId||null,p.subject,p.date,cents(entry.value),'课堂回答（补录）',entry.note.trim());return entries.length;
      }
      if(action==='score') {
        const a=this.active();if(!a)throw Error('请先点击学科开始');if(p.sessionId!==undefined&&p.sessionId!==a.id)throw Error('课次已切换，请重新选择学生后记分');const st=this.one('SELECT * FROM students WHERE id=?',[p.studentId]);if(!st||st.class_id!==a.class_id||!st.active||JSON.parse(a.absent).includes(st.id))throw Error('请选择本班到场学生');
        this.addPoint(st.id,a.id,a.subject,day(),cents(p.value),'课堂回答',String(p.note||''));return;
      }
      if(action==='undo') { this.reverse(p.id);return; }
      if(action==='undoBatch') { const rows=this.all('SELECT id FROM points WHERE batch_id=? AND reversal_of IS NULL AND id NOT IN (SELECT reversal_of FROM points WHERE reversal_of IS NOT NULL)',[p.id]);if(!rows.length)throw Error('该批次已撤销或不存在');for(const row of rows)this.reverse(row.id);return; }
      if(action==='studentActive') { const st=this.one('SELECT * FROM students WHERE id=?',[p.id]);if(!st||st.deleted_at)throw Error('学生不存在或已删除');if(this.active()?.class_id===st.class_id)throw Error('请先结束课堂再调整名单');this.run('UPDATE students SET active=? WHERE id=?',[p.active?1:0,p.id]);if(!p.active){const c=this.one('SELECT * FROM classes WHERE id=?',[st.class_id]);const layout=JSON.parse(c.layout);for(const k of Object.keys(layout))if(layout[k]===st.id)delete layout[k];this.run('UPDATE classes SET layout=? WHERE id=?',[JSON.stringify(layout),c.id]);}return; }
      throw Error('未知操作');
    });
  }
  tickSchedule(date=new Date()){
    const follow=this.get('scheduleFollow');if(!follow)return false;
    const plan=(this.get('timetables')||{})[follow],course=timetable.status(plan,date).current,active=this.active(),link=this.get('scheduleSession');
    const due=active&&link?.sessionId===active.id&&link.classId===follow&&date>=new Date(link.end);
    const skipped=(this.get('scheduleSkipped')||{})[follow];
    const canStart=(!active||due)&&course&&course.key!==skipped&&!(link?.classId===follow&&link.key===course.key);
    if(!due&&!canStart)return false;
    return this.tx(()=>{
      if(due)this.run('UPDATE sessions SET end=? WHERE id=?',[new Date(link.end).toISOString(),active.id]);
      if(canStart){const c=this.one('SELECT * FROM classes WHERE id=?',[follow]);if(!c||!JSON.parse(c.subjects).includes(course.subject)||!this.get('subjects').includes(course.subject))return !!due;
        const sid=id();this.run('INSERT INTO sessions(id,class_id,subject,start) VALUES (?,?,?,?)',[sid,follow,course.subject,date.toISOString()]);this.set('scheduleSession',{sessionId:sid,classId:follow,key:course.key,end:course.date+'T'+course.end+':00'});
      }
      return true;
    });
  }
  recordEventBatch(p){
    if(!Array.isArray(p.entries)||!p.entries.length)throw Error('请先添加待保存情况');
    if(!validDate(p.date)||p.date>day()||!this.get('subjects').includes(p.subject))throw Error('请选择今天或以前的有效日期和科目');
    const c=this.one('SELECT * FROM classes WHERE id=?',[p.classId]);if(!c)throw Error('班级不存在');
    const lesson=String(p.lesson||'').trim();if(lesson.length>50)throw Error('课节名称不能超过50字');
    if(p.sessionId){const ss=this.one('SELECT * FROM sessions WHERE id=?',[p.sessionId]);if(!ss||ss.class_id!==c.id||ss.subject!==p.subject||day(new Date(ss.start))!==p.date)throw Error('所选课次与班级、科目或日期不一致');}
    const kinds=this.get('eventKinds')??EVENT_KINDS;
    for(const entry of p.entries){
      if(entry.value!==undefined&&entry.value!==null)cents(entry.value);
      if(!kinds.includes(entry.kind))throw Error('情况类型已删除或不存在，请重新选择');
      if(typeof entry.note!=='string'||entry.note.length>500)throw Error('个人备注不能超过500字');
      const st=this.one('SELECT * FROM students WHERE id=?',[entry.studentId]);if(!st||st.class_id!==c.id||!st.active)throw Error('请选择本班在班学生');
    }
    let added=0;
    for(const entry of p.entries){
      if(this.one("SELECT id FROM class_events WHERE student_id=? AND COALESCE(session_id,'')=? AND subject=? AND date=? AND kind=? AND lesson=? AND voided_at IS NULL",[entry.studentId,p.sessionId||'',p.subject,p.date,entry.kind,p.sessionId?'':lesson]))continue;
      const eventId=id();this.run('INSERT INTO class_events(id,student_id,session_id,subject,date,kind,note,created,voided_at,lesson) VALUES (?,?,?,?,?,?,?,?,NULL,?)',[eventId,entry.studentId,p.sessionId||null,p.subject,p.date,entry.kind,entry.note.trim(),now(),p.sessionId?'':lesson]);if(entry.value!==undefined&&entry.value!==null){const pointId=this.addPoint(entry.studentId,p.sessionId||null,p.subject,p.date,cents(entry.value),'课堂情况：'+entry.kind,entry.note.trim());this.run('UPDATE class_events SET point_id=? WHERE id=?',[pointId,eventId]);}added++;
    }
    if(p.sessionId&&p.entries.some(e=>e.kind==='缺席'))this.syncAbsence(p.sessionId);
    return added;
  }
  syncAbsence(sessionId){const ids=this.all("SELECT DISTINCT student_id FROM class_events WHERE session_id=? AND kind='缺席' AND voided_at IS NULL",[sessionId]).map(r=>r.student_id);this.run('UPDATE sessions SET absent=? WHERE id=?',[JSON.stringify(ids),sessionId]);}
  events(filter={}){
    let sql='SELECT e.*,p.amount score_amount,EXISTS(SELECT 1 FROM points r WHERE r.reversal_of=e.point_id) score_reversed,s.name,s.number,s.class_id,c.name class_name FROM class_events e LEFT JOIN points p ON p.id=e.point_id JOIN students s ON s.id=e.student_id JOIN classes c ON c.id=s.class_id WHERE 1=1';const args=[];
    for(const [key,col] of [['classId','s.class_id'],['sessionId','e.session_id'],['subject','e.subject']])if(filter[key]){sql+=` AND ${col}=?`;args.push(filter[key]);}
    if(filter.lesson!==undefined){sql+=' AND e.lesson=? AND e.session_id IS NULL';args.push(filter.lesson);}if(filter.from){sql+=' AND e.date>=?';args.push(filter.from);}if(filter.to){sql+=' AND e.date<=?';args.push(filter.to);}
    if(filter.fromInstant){sql+=' AND ((e.session_id IS NOT NULL AND (SELECT start FROM sessions WHERE id=e.session_id) BETWEEN ? AND ?) OR (e.session_id IS NULL AND e.date BETWEEN ? AND ?))';args.push(filter.fromInstant,filter.toInstant,filter.fallbackFromDate,filter.fallbackToDate);}
    return this.all(sql+' ORDER BY e.created DESC,e.rowid DESC',args);
  }
  addPoint(student,session,subject,date,amount,category,note,batch=null,reversal=null) { const pid=id();this.run('INSERT INTO points VALUES (?,?,?,?,?,?,?,?,?,?,?)',[pid,student,session,subject||null,date,amount,category,note,now(),reversal,batch]);return pid; }
  reverse(pid) { const row=this.one('SELECT * FROM points WHERE id=?',[pid]);if(!row||row.reversal_of||this.one('SELECT id FROM points WHERE reversal_of=?',[pid]))throw Error('该记录不能再次撤销');this.addPoint(row.student_id,row.session_id,row.subject,row.date,-row.amount,'撤销',`撤销：${row.category} ${row.note}`,row.batch_id,row.id); }
  records(filter={}) {
    let sql=`SELECT p.*,s.name,s.number,s.class_id,c.name class_name,EXISTS(SELECT 1 FROM points r WHERE r.reversal_of=p.id) reversed FROM points p JOIN students s ON s.id=p.student_id JOIN classes c ON c.id=s.class_id WHERE 1=1`;const args=[];
    for(const [key,col] of [['classId','s.class_id'],['sessionId','p.session_id'],['subject','p.subject']])if(filter[key]){sql+=` AND ${col}=?`;args.push(filter[key]);}
    if(filter.from){sql+=' AND p.date>=?';args.push(filter.from);}if(filter.to){sql+=' AND p.date<=?';args.push(filter.to);}
    if(filter.fromInstant){sql+=' AND ((p.session_id IS NOT NULL AND (SELECT start FROM sessions WHERE id=p.session_id) BETWEEN ? AND ?) OR (p.session_id IS NULL AND p.date BETWEEN ? AND ?))';args.push(filter.fromInstant,filter.toInstant,filter.fallbackFromDate,filter.fallbackToDate);}
    if(filter.academic){sql+=' AND p.subject IS NOT NULL';}
    return this.all(sql+' ORDER BY p.created DESC,p.rowid DESC',args);
  }
  preview(kind,rows,hash,classId=null,singleClass=false) {
    const errors=[],warnings=[],seen=new Set();const clean=[];
    const target=classId?this.one('SELECT * FROM classes WHERE id=?',[classId]):null;
    if(classId&&!target)errors.push('当前班级不存在，请重新打开设置');
    if(!rows.length)errors.push('表格没有数据');if(this.one('SELECT id FROM batches WHERE hash=?',[hash]))errors.push('该文件已经导入，不能重复提交');
    rows.forEach((row,index)=>{try{
      const name=String(row['姓名']??'').trim(),number=String(row['学号']??'').trim(),suppliedClass=String(row['班级']??'').trim(),className=suppliedClass||target?.name||'';
      if(target&&suppliedClass&&suppliedClass!==target.name)throw Error(`班级名称“${suppliedClass}”与当前班级“${target.name}”不一致`);
      if(!name||!number||!className)throw Error('班级、学号、姓名不能为空');
      const c=this.one('SELECT * FROM classes WHERE name=?',[className]);const student=c?this.one('SELECT * FROM students WHERE class_id=? AND number=?',[c.id,number]):null;
      if(kind==='roster') {
        const key=className+'\0'+number;if(seen.has(key))throw Error('班级内学号重复');seen.add(key);
        if(student?.deleted_at)throw Error('学号属于已删除学生，不能通过名单导入隐式恢复，请核对');
        if(student&&student.name!==name)throw Error('学号已有不同姓名，请核实');
        const supplied=String(row['状态']??'').trim();if(supplied&&!['在班','停用'].includes(supplied))throw Error('状态只能填写“在班”或“停用”，也可留空');
        const active=supplied?Number(supplied==='在班'):student?.active??1,changed=student&&student.active!==active;
        if(changed&&this.active()?.class_id===c.id)throw Error('请先结束本班课堂再改变学生在班状态');
        clean.push({className,number,name,active,status:student?(changed?(active?'恢复':'停用'):'已存在'):'新增'});
      }
      else {
        if(!student||!student.active||student.name!==name)throw Error('学生不存在、已停用或姓名与学号不符');
        const date=String(row['日期']??'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('日期请使用有效的 YYYY-MM-DD');
        const amount=cents(row['分值']),category=String(row['类别']??'').trim(),subject=String(row['科目']??'').trim(),note=String(row['备注']??'').trim();if(!category)throw Error('类别不能为空');if(subject&&!this.get('subjects').includes(subject))throw Error('科目不在科目库中');
        const key=JSON.stringify([student.id,date,amount,category,subject,note]);if(seen.has(key)||this.one('SELECT id FROM points WHERE student_id=? AND date=? AND amount=? AND category=? AND COALESCE(subject,\'\')=? AND note=? AND reversal_of IS NULL',[student.id,date,amount,category,subject,note]))warnings.push(`第${index+2}行可能重复，请核实`);seen.add(key);
        clean.push({studentId:student.id,date,amount,category,subject,note,name,number,className});
      }
    }catch(e){errors.push(`第${index+2}行：${e.message}`);}});
    if(kind==='roster'&&singleClass&&!target&&new Set(clean.map(r=>r.className)).size>1)errors.push('一次只能导入一个班级，请核对“班级”列');
    return {kind,rows:clean,errors,warnings,hash};
  }
  importRows(kind,rows,hash,label,allowDuplicate=false,classId=null,singleClass=false) {
    const preview=this.preview(kind,rows,hash,classId,singleClass);if(preview.errors.length)throw Error(preview.errors.join('\n'));if(preview.warnings.length&&!allowDuplicate)throw Error('请确认疑似重复记录');this.backup('before-import');
    return this.tx(()=>{
      const batch=id();this.run('INSERT INTO batches VALUES (?,?,?,?)',[batch,hash,now(),label]);
      for(const row of preview.rows) {
        if(kind==='roster') {
          let c=this.one('SELECT * FROM classes WHERE name=?',[row.className]);if(!c){const cid=id();this.run('INSERT INTO classes(id,name,subjects) VALUES (?,?,?)',[cid,row.className,JSON.stringify(this.get('subjects'))]);c=this.one('SELECT * FROM classes WHERE id=?',[cid]);}
          const existing=this.one('SELECT id,active FROM students WHERE class_id=? AND number=?',[c.id,row.number]);
          if(!existing)this.run('INSERT INTO students(id,class_id,number,name,active) VALUES (?,?,?,?,?)',[id(),c.id,row.number,row.name,row.active]);
          else if(existing.active!==row.active){
            this.run('UPDATE students SET active=? WHERE id=?',[row.active,existing.id]);
            if(!row.active){const layout=JSON.parse(c.layout);for(const key of Object.keys(layout))if(layout[key]===existing.id)delete layout[key];this.run('UPDATE classes SET layout=? WHERE id=?',[JSON.stringify(layout),c.id]);}
          }
        }
        else this.addPoint(row.studentId,null,row.subject,row.date,row.amount,row.category,row.note,batch);
      }
      return preview.rows.length;
    });
  }
}
module.exports={Store,cents,day,SUBJECTS};
