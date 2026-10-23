const answerEntry={
  ids:[],notes:{},draftContext:null,choice:'1',custom:'',review:null,
  get context(){return this.draftContext||{classId:state.classId,...state.eventContext};},
  people(){return state.data.students.filter(s=>s.class_id===this.context.classId&&s.active);},
  page(){if(this.choice!=='custom'&&!state.data.scores.some(v=>String(v)===String(this.choice)))this.choice=String(state.data.scores.find(v=>v>0)??state.data.scores[0]);const c=state.eventContext,byId=new Map(this.people().map(s=>[s.id,s]));return `<div class="bar"><h2>补录回答积分</h2><button data-action="eventContext" ${this.ids.length?'disabled':''}>选择日期、科目与课次</button></div>${!c?'<section>先选择日期与科目，再选择学生记分。</section>':`<section><p class="backfill-label">${esc(currentClass()?.name)} · ${esc(c.date)} · ${esc(c.subject)} · ${c.sessionId?'关联所选课次':'按当天记录'}</p><h2>1　选择每人分值</h2>${entryScoreOptions('answer',this.choice,this.custom)}<h2>2　点选学生，可多选</h2>${eventEntry.seats.call(this,'answer')}${this.ids.length?`<h3>个人备注（可选）</h3>${this.ids.map(id=>`<label class="individual-note">${esc(byId.get(id)?.name)}<input data-answer-note="${id}" maxlength="500" value="${esc(this.notes[id]||'')}" placeholder="只属于这名学生的备注"></label>`).join('')}`:''}</section><section><h2>3　核对后保存</h2><p>已选 ${this.ids.length} 人，${esc(this.ids.map(id=>byId.get(id)?.name).join('、'))}</p><div class="bar"><button data-action="clearAnswers" ${!this.ids.length?'disabled':''}>清空选择</button><button class="primary" data-action="answerReview" ${!this.ids.length?'disabled':''}>核对并保存</button></div></section>`}`;},
  async click(el){if(el.dataset.answerStudent){if(!this.ids.length)this.draftContext={classId:state.classId,...state.eventContext};const id=el.dataset.answerStudent,i=this.ids.indexOf(id);if(i<0)this.ids.push(id);else this.ids.splice(i,1);if(!this.ids.length)this.draftContext=null;}else if(el.dataset.answerScore!==undefined)this.choice=el.dataset.answerScore;else return false;render();return true;},
  async action(action){
    if(action==='clearAnswers'){this.reset();render();return true;}
    if(action==='answerReview'){
      if(!state.eventContext||!this.ids.length)throw Error('请选择日期、科目与学生');const value=entryScoreValue(this.choice,this.custom);
      this.review={...this.context,entries:this.ids.map(studentId=>({studentId,value,note:this.notes[studentId]||''}))};
      showDialog(`<h2>确认补录 ${this.ids.length} 人？</h2><p>${esc(currentClass()?.name)} · ${esc(state.eventContext.date)} · ${esc(state.eventContext.subject)}</p><p>每人 ${esc(entryScoreLabel(value))}，合计 ${num(Math.round(value*100)*this.ids.length)} 分。</p><ul>${this.review.entries.map(r=>`<li>${esc(state.data.students.find(s=>s.id===r.studentId)?.name)}：${esc(entryScoreLabel(r.value))}${r.note?' · '+esc(r.note):''}</li>`).join('')}</ul><button class="primary" data-action="answerSave">确认保存</button>`);return true;
    }
    if(action==='answerSave'){if(!this.review)throw Error('请先核对补录内容');const n=await call('backfillScoreBatch',this.review);this.reset();$('#modal').close();await refresh();toast(`已为 ${n} 人补录积分`);return true;}
    return false;
  },
  reset(){this.draftContext=null;this.ids=[];this.notes={};this.review=null;}
};
document.addEventListener('input',e=>{if(e.target.dataset.answerNote)answerEntry.notes[e.target.dataset.answerNote]=e.target.value;if(e.target.id==='answerCustomScore')answerEntry.custom=e.target.value;});
