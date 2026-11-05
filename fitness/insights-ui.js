(() => {
 'use strict';
 const $=s=>document.querySelector(s),D=FitData,I=FitInsights;
 const today=()=>I.dateKey(new Date()),fmt=n=>n===null||n===undefined?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
 const label=key=>I.date(key).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 let activityMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),savingActivity=false;
 let statsTo=today(),statsFrom=offset(statsTo,-29);
 function offset(key,days){const d=I.date(key);d.setDate(d.getDate()+days);return I.dateKey(d);}
 function renderGoal(state){
  const view=I.goalView(state,today());
  if(!$('#weightGoalForm').contains(document.activeElement))$('#weightGoalTarget').value=state.weightGoal?.target??'';
  $('#weightGoalClear').hidden=!state.weightGoal;
  for(const [id,value] of [['#goalStart',view.start],['#goalCurrent',view.current],['#goalTarget',view.target]])$(id).textContent=value===null?'—':fmt(value)+' кг';
  const scale=$('#weightGoalScale');$('#weightGoalFill').style.width=(view.progress===null?0:view.progress*100)+'%';scale.classList.toggle('pending',view.progress===null);
  if(view.progress===null){scale.removeAttribute('aria-valuenow');scale.setAttribute('aria-valuetext','Шкала пока пуста');}else{scale.setAttribute('aria-valuenow',String(Math.round(view.progress*100)));scale.setAttribute('aria-valuetext',Math.round(view.progress*100)+'% пути к цели');}
  $('#weightGoalHint').textContent=view.count<7?`Утренних взвешиваний: ${view.count} из 7. Старт и шкала появятся после седьмого.`:!state.weightGoal?'Установите желаемый вес. Старт зафиксируется по последним 7 утренним взвешиваниям.':`Старт зафиксирован ${label(state.weightGoal.capturedOn||state.weightGoal.createdOn)}. Текущее значение — среднее последних 7 взвешиваний${view.progress===null?'':` · ${Math.round(view.progress*100)}%`}.`;
 }
 $('#weightGoalForm').onsubmit=e=>{
  e.preventDefault();const state=FitApp.read(),target=Number($('#weightGoalTarget').value),status=$('#weightGoalStatus');
  if(!Number.isFinite(target)||target<=0){status.textContent='Укажите положительный вес';return;}
  const recent=I.lastSeven(state,today());
  const goal=state.weightGoal?.target===target?state.weightGoal:{target,start:recent.average,createdOn:today(),capturedOn:recent.average===null?null:today()};
  status.textContent=FitApp.update({...state,weightGoal:goal})?'Цель сохранена':'Не удалось сохранить цель';
 };
 $('#weightGoalClear').onclick=()=>{if(FitApp.update({...FitApp.read(),weightGoal:null})){$('#weightGoalTarget').value='';$('#weightGoalStatus').textContent='Цель сброшена';}};
 function renderActivity(state){
  if(savingActivity||$('#activityRows').contains(document.activeElement))return;
  $('#activityMonth').value=I.dateKey(activityMonth).slice(0,7);
  const count=new Date(activityMonth.getFullYear(),activityMonth.getMonth()+1,0).getDate();let html='';
  for(let n=1;n<=count;n++){
   const key=I.dateKey(new Date(activityMonth.getFullYear(),activityMonth.getMonth(),n)),v=D.activityRecord(state.extraActivity[key]||{});
   const checkbox=(field,title)=>`<label class="activity-check"><input type="checkbox" data-activity-field="${field}" ${v[field]?'checked':''} aria-label="${title} ${label(key)}"><span>${title}</span></label>`;
   html+=`<article class="activity-day ${key===today()?'today':''}" data-activity-date="${key}"><div class="activity-date"><strong>${label(key)}</strong><span>${I.date(key).toLocaleDateString('ru-RU',{weekday:'short'})}</span></div>${checkbox('treadmill','Дорожка')}<label class="activity-number">Дистанция, км<input type="number" min="0" max="1000" step="any" data-activity-field="distance" aria-label="Дистанция ${label(key)}" value="${v.distance??''}" ${v.treadmill?'':'disabled'} placeholder="—"></label><label class="activity-number">Время, мин<input type="number" min="0" max="1440" step="any" data-activity-field="duration" aria-label="Время на дорожке ${label(key)}" value="${v.duration??''}" ${v.treadmill?'':'disabled'} placeholder="—"></label>${checkbox('posture','Осанка')}${checkbox('forearms','Предплечья')}</article>`;
  }
  $('#activityRows').innerHTML=html;
 }
 $('#activityRows').onchange=e=>{
  const input=e.target.closest('[data-activity-field]');if(!input)return;
  const row=input.closest('[data-activity-date]'),date=row.dataset.activityDate,field=input.dataset.activityField,status=$('#activitySaveStatus');
  try{
   if(!input.checkValidity())throw Error('Проверьте дистанцию и время');
   const state=FitApp.read(),value=input.type==='checkbox'?input.checked:input.value===''?null:Number(input.value);
   const record=D.activityRecord({...state.extraActivity[date],[field]:value});
   savingActivity=true;let saved;try{saved=FitApp.update({...state,extraActivity:{...state.extraActivity,[date]:record}});}finally{savingActivity=false;}
   if(!saved)throw Error('Не удалось сохранить');
   for(const element of row.querySelectorAll('[data-activity-field]')){const key=element.dataset.activityField;if(element.type==='checkbox')element.checked=record[key];else{element.disabled=!record.treadmill;if(element!==document.activeElement)element.value=record[key]??'';}}
   status.textContent='Сохранено';status.className='status good';
  }catch(error){status.textContent=error.message;status.className='status bad';input.blur();renderActivity(FitApp.read());}
 };
 $('#activityRows').addEventListener('focusout',()=>setTimeout(()=>renderActivity(FitApp.read()),0));
 function setActivityMonth(d){activityMonth=d;renderActivity(FitApp.read());}
 $('#activityPrev').onclick=()=>setActivityMonth(new Date(activityMonth.getFullYear(),activityMonth.getMonth()-1,1));
 $('#activityNext').onclick=()=>setActivityMonth(new Date(activityMonth.getFullYear(),activityMonth.getMonth()+1,1));
 $('#activityToday').onclick=()=>{setActivityMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));$(`[data-activity-date="${today()}"]`)?.scrollIntoView({block:'center'});};
 $('#activityMonth').onchange=e=>{if(D.validDate(e.target.value+'-01')){const d=I.date(e.target.value+'-01');setActivityMonth(new Date(d.getFullYear(),d.getMonth(),1));}};
 function weightChart(samples){
  if(!samples.length)return '<div class="empty">За этот период нет утренних взвешиваний.</div>';
  const values=samples.map(v=>v.weight),min=Math.min(...values)-.5,max=Math.max(...values)+.5,W=matchMedia('(max-width:820px)').matches?360:900,H=250,L=52,R=18,T=16,B=214;
  const start=+I.date(statsFrom),span=Math.max(86400000,+I.date(statsTo)-start),x=v=>L+(+I.date(v.date)-start)/span*(W-L-R),y=v=>B-(v.weight-min)/(max-min)*(B-T);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Фактический утренний вес за выбранный период">`;
  for(let n=0;n<=4;n++){const value=min+(max-min)*n/4,py=B-(B-T)*n/4;svg+=`<line x1="${L}" x2="${W-R}" y1="${py}" y2="${py}" stroke="var(--line)"/><text x="0" y="${py+4}">${fmt(value)}</text>`;}
  svg+=`<polyline points="${samples.map(v=>`${x(v)},${y(v)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  for(const v of samples)svg+=`<circle cx="${x(v)}" cy="${y(v)}" r="4" fill="var(--accent)"><title>${label(v.date)}: ${fmt(v.weight)} кг</title></circle>`;
  svg+=`<text x="${L}" y="244">${label(statsFrom)}</text><text x="${W-R}" y="244" text-anchor="end">${label(statsTo)}</text></svg>`;return svg;
 }
 function renderStats(state){
  let stats;try{stats=I.statistics(state,statsFrom,statsTo);}catch{return;}
  if(!$('#statsPeriodForm').contains(document.activeElement)){$('#statsFrom').value=statsFrom;$('#statsTo').value=statsTo;}
  const metric=(title,value,meta)=>`<article class="card"><h3>${title}</h3><div class="num">${value}</div><p class="hint">${meta}</p></article>`;
  $('#statsOverview').innerHTML=metric('Средний вес',fmt(stats.weightAverage)+(stats.weightAverage===null?'':' кг'),`Взвешиваний: ${stats.weighings.length}${state.weightGoal?' · Цель: '+fmt(state.weightGoal.target)+' кг':''}`)+metric('Силовые тренировки',stats.strengthCount,`Время: ${fmt(stats.strengthMinutes)} мин`)+metric('Беговая дорожка',fmt(stats.treadmill.distance)+' км',`${fmt(stats.treadmill.minutes)} мин · среднее ${fmt(stats.treadmill.average)} мин за сессию`)+metric('Дней активности',stats.activeDays,`Осанка: ${stats.postureDays} · Предплечья: ${stats.forearmDays}`);
  const labels={calories:'Ккал',protein:'Белки, г',fat:'Жиры, г',carbs:'Углеводы, г'};
  $('#statsNutrition').innerHTML=Object.entries(stats.nutrition).map(([field,v])=>`<div><span>${labels[field]}</span><strong>${fmt(v.average)}</strong><small>Дней с данными: ${v.count}</small></div>`).join('');
  $('#weightHistoryChart').innerHTML=weightChart(stats.weighings);
  $('#weightHistoryRows').innerHTML=stats.weighings.map(v=>`<tr><td>${label(v.date)}</td><td>${fmt(v.weight)}</td></tr>`).join('');
  $('#weightWeeks').innerHTML=stats.weekly.map(v=>`<tr><td>${label(v.from)} — ${label(v.to)}</td><td>${v.count}</td><td>${fmt(v.average)}</td></tr>`).join('')||'<tr><td colspan="3">Нет взвешиваний за период</td></tr>';
  $('#calendarMarkCounts').textContent=`Отметок на главной: ${stats.homeMarks} · Отметок в журнале: ${stats.trainingMarks}`;
  $('#measurementHistory').innerHTML=stats.measurements.map(([day,v])=>`<article class="measurement-card"><div class="panel-head"><h3>${label(day)}</h3><button class="mini-btn" data-edit-measurement="${day}">Изменить</button></div><div class="measurement-values">${Object.entries(D.measurementFields).map(([field,title])=>`<div><span>${title}</span><strong>${fmt(v[field])} <small>см</small></strong></div>`).join('')}</div></article>`).join('')||'<div class="empty">За этот период замеров пока нет.</div>';
  window.dispatchEvent(new CustomEvent('fit:stats',{detail:{from:statsFrom,to:statsTo}}));
 }
 $('#statsPeriodForm').onsubmit=e=>{e.preventDefault();try{I.statistics(FitApp.read(),$('#statsFrom').value,$('#statsTo').value);statsFrom=$('#statsFrom').value;statsTo=$('#statsTo').value;$('#statsError').textContent='';document.querySelectorAll('[data-stats-days]').forEach(b=>b.classList.remove('active'));renderStats(FitApp.read());}catch(error){$('#statsError').textContent=error.message;}};
 document.querySelectorAll('[data-stats-days]').forEach(button=>button.onclick=()=>{statsTo=today();statsFrom=offset(statsTo,1-Number(button.dataset.statsDays));document.querySelectorAll('[data-stats-days]').forEach(b=>b.classList.toggle('active',b===button));$('#statsError').textContent='';renderStats(FitApp.read());});
 $('#measurementFields').innerHTML=Object.entries(D.measurementFields).map(([field,title])=>`<label>${title}, см<input type="number" name="${field}" min="0.01" step="any" placeholder="Не указан"></label>`).join('');
 function loadMeasurements(){const date=$('#measurementForm').elements.date.value,record=FitApp.read().measurements[date];for(const field of Object.keys(D.measurementFields))$('#measurementForm').elements[field].value=record?.[field]??'';$('#measurementDelete').hidden=!record;$('#measurementError').textContent='';}
 function openMeasurements(date){$('#measurementForm').reset();$('#measurementForm').elements.date.value=date;loadMeasurements();$('#measurementModal').showModal();}
 $('#measurementAdd').onclick=()=>openMeasurements(statsTo>today()?today():statsTo);$('#measurementClose').onclick=()=>$('#measurementModal').close();$('#measurementForm').elements.date.onchange=loadMeasurements;
 $('#measurementHistory').onclick=e=>{const button=e.target.closest('[data-edit-measurement]');if(button)openMeasurements(button.dataset.editMeasurement);};
 $('#measurementForm').onsubmit=e=>{e.preventDefault();try{const date=e.target.elements.date.value;if(!D.validDate(date))throw Error('Проверьте дату');const record=D.measurementRecord(Object.fromEntries(Object.keys(D.measurementFields).map(field=>[field,e.target.elements[field].value===''?null:Number(e.target.elements[field].value)])));const state=FitApp.read();if(FitApp.update({...state,measurements:{...state.measurements,[date]:record}}))$('#measurementModal').close();}catch(error){$('#measurementError').textContent=error.message;}};
 $('#measurementDelete').onclick=()=>{const date=$('#measurementForm').elements.date.value;if(!confirm(`Удалить замеры за ${label(date)}?`))return;const state=FitApp.read(),next={...state.measurements};delete next[date];if(FitApp.update({...state,measurements:next}))$('#measurementModal').close();};
 function renderAll(){let state;try{state=FitApp.read();}catch{return;}renderGoal(state);renderActivity(state);renderStats(state);}
 window.addEventListener('fit:change',renderAll);
 window.matchMedia('(max-width:820px)').addEventListener('change',()=>renderStats(FitApp.read()));
 try{const initial=FitApp.read(),anchored=I.anchorGoal(initial,today());if(anchored!==initial)FitApp.update(anchored);renderAll();}catch{$('#weightGoalHint').textContent='Не удалось прочитать локальные данные';}
})();
