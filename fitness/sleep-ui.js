(() => {
 'use strict';
 const $=selector=>document.querySelector(selector),D=FitData,I=FitInsights,S=FitSleep;
 const today=()=>I.dateKey(new Date());
 const number=value=>value===null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
 const label=key=>I.date(key).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function hours(value){if(value===null)return '—';const minutes=Math.round(value);return `${Math.floor(minutes/60)} ч ${String(minutes%60).padStart(2,'0')} мин`;}
 function clock(value){if(value===null)return '—';const minutes=Math.round(value)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
 const qualityLabels=['Очень плохо','Плохо','Средне','Хорошо','Отлично'];
 const quality=value=>value===null?'—':`${'★'.repeat(value)}${'☆'.repeat(5-value)}`;
 let month=new Date(new Date().getFullYear(),new Date().getMonth(),1);
 let period={from:$('#statsFrom').value,to:$('#statsTo').value};

 function renderHome(state){
  const summary=S.recent(state,today(),7);
  $('#sleepHomeAverage').textContent=hours(summary.average);
  $('#sleepHomeCount').textContent=`Среднее · заполнено ${summary.count} из 7 ночей`;
  const nights=new Map(summary.rows.map(row=>[row.date,row]));
  $('#sleepHomeBars').innerHTML=Array.from({length:7},(_,index)=>{
   const day=S.offset(today(),index-6),minutes=nights.get(day)?.minutes??null;
   return `<button class="sleep-spark ${minutes===null?'missing':''}" data-sleep-date="${day}" aria-label="Сон к ${label(day)}: ${minutes===null?'нет длительности':hours(minutes)}" title="${label(day)}: ${hours(minutes)}"><span class="sleep-spark-track"><i style="height:${minutes===null?4:Math.max(8,Math.min(64,minutes/600*64))}px"></i></span><small>${I.date(day).toLocaleDateString('ru-RU',{weekday:'short'})}</small></button>`;
  }).join('');
 }
 function renderJournal(state){
  const monthKey=I.dateKey(month).slice(0,7),from=monthKey+'-01',to=I.dateKey(new Date(month.getFullYear(),month.getMonth()+1,0)),summary=S.summary(state,from,to);
  if(document.activeElement!==$('#sleepMonth'))$('#sleepMonth').value=monthKey;
  $('#sleepMonthSummary').textContent=`Записей: ${summary.rows.length} · среднее ${hours(summary.average)}`;
  $('#sleepRows').innerHTML=[...summary.rows].reverse().map(row=>`<tr data-sleep-row="${row.date}"><th scope="row">${label(row.date)}<small>${I.date(row.date).toLocaleDateString('ru-RU',{weekday:'short'})}</small></th><td data-label="Лёг спать">${row.bedtime??'—'}</td><td data-label="Проснулся">${row.wakeTime??'—'}</td><td data-label="Засыпание">${row.latency===null?'—':row.latency+' мин'}</td><td data-label="Сон" class="sleep-duration">${hours(row.minutes)}</td><td data-label="Качество"><span class="sleep-stars" aria-label="${row.quality===null?'Не оценено':row.quality+' из 5'}">${quality(row.quality)}</span></td><td class="sleep-edit"><button class="mini-btn" data-sleep-date="${row.date}">Изменить</button></td></tr>`).join('')||'<tr class="sleep-empty"><td colspan="7"><div class="empty">Пока нет записей за этот месяц.<br>Добавьте первую ночь кнопкой «Записать сон».</div></td></tr>';
 }
 function setMonth(value){month=value;renderJournal(FitApp.read());}
 $('#sleepPrev').onclick=()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1));
 $('#sleepNext').onclick=()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1));
 $('#sleepToday').onclick=()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));
 $('#sleepMonth').onchange=event=>{const key=event.target.value+'-01';if(D.validDate(key))setMonth(I.date(key));};

 function chart(summary){
  const rows=summary.rows.filter(row=>row.minutes!==null);
  if(!rows.length)return '<div class="empty">Нет заполненных ночей за выбранный период.</div>';
  const W=matchMedia('(max-width:820px)').matches?360:900,H=250,L=42,R=16,T=16,B=214;
  const max=Math.max(10,Math.ceil(Math.max(...rows.map(row=>row.minutes/60)))),start=+I.date(period.from),span=Math.max(86400000,+I.date(period.to)-start);
  const x=day=>L+(+I.date(day)-start)/span*(W-L-R),y=hours=>B-hours/max*(B-T),barWidth=Math.min(24,Math.max(2,(W-L-R)/(span/86400000+1)*.6));
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Длительность сна по ночам, в часах"><rect x="${L}" y="${y(9)}" width="${W-L-R}" height="${y(7)-y(9)}" fill="var(--good)" opacity=".12"/>`;
  for(let index=0;index<=4;index++){const value=max*index/4,py=y(value);svg+=`<line x1="${L}" x2="${W-R}" y1="${py}" y2="${py}" stroke="var(--line)"/><text x="0" y="${py+4}">${number(value)} ч</text>`;}
  for(const row of rows){const cx=Math.max(L+barWidth/2,Math.min(W-R-barWidth/2,x(row.date)));svg+=`<rect x="${cx-barWidth/2}" y="${y(row.minutes/60)}" width="${barWidth}" height="${B-y(row.minutes/60)}" rx="3" fill="var(--accent)"><title>${label(row.date)}: ${hours(row.minutes)}${row.quality===null?'':' · качество '+row.quality+'/5'}</title></rect>`;}
  return svg+`<text x="${L}" y="244">${label(period.from)}</text><text x="${W-R}" y="244" text-anchor="end">${label(period.to)}</text></svg>`;
 }
 function renderStatistics(state){
  if(!D.validDate(period.from)||!D.validDate(period.to))return;
  const summary=S.summary(state,period.from,period.to),seven=S.recent(state,period.to,7),thirty=S.recent(state,period.to,30);
  const metric=(title,value,hint)=>`<div><span>${title}</span><strong>${value}</strong><small>${hint}</small></div>`;
  $('#sleepStatsPeriod').textContent=`${label(period.from)} — ${label(period.to)}`;
  $('#sleepStatsMetrics').innerHTML=metric('Среднее за 7 дней',hours(seven.average),`Ночей с данными: ${seven.count} · до ${label(period.to)}`)+metric('Среднее за 30 дней',hours(thirty.average),`Ночей с данными: ${thirty.count} · до ${label(period.to)}`)+metric('Ночей по 7–9 часов',summary.goodPercent===null?'—':number(summary.goodPercent)+'%',`${summary.good} из ${summary.count} заполненных ночей за период`)+metric('Среднее качество',summary.quality===null?'—':number(summary.quality)+' / 5',`Оценок за период: ${summary.qualityCount}`);
  const timing=(title,data)=>metric(title,clock(data.average),data.deviation===null?'Для разброса нужны хотя бы 2 записи':`Среднее отклонение: ±${Math.round(data.deviation)} мин · записей: ${data.count}`);
  $('#sleepRegularity').innerHTML=metric('Среднее за выбранный период',hours(summary.average),`Ночей с длительностью: ${summary.count}`)+timing('Среднее время отхода ко сну',summary.bedtime)+timing('Среднее время подъёма',summary.wakeTime);
  $('#sleepHistoryChart').innerHTML=chart(summary);
  const comparisons=S.trainingComparison(state,period.from,period.to);
  $('#sleepTrainingComparison').innerHTML=comparisons.map(({workout,sleep})=>{
   const rows=workout.exercises||D.exerciseRows(workout.chatData||workout),exercises=rows.filter(row=>row.exercise);
   return `<article class="sleep-training"><div class="panel-head"><h3>${label(workout.date)}</h3><span class="hint">Тренировка: ${workout.duration===null?'—':workout.duration+' мин'}</span></div><p>Сон перед тренировкой: <strong>${hours(sleep?.minutes??null)}</strong><span class="hint"> · качество ${sleep?.quality===null||!sleep?'—':sleep.quality+'/5'}</span></p>${exercises.length?`<details><summary>Упражнения: ${exercises.length}</summary><ul>${exercises.map(row=>`<li><strong>${escape(row.exercise)}</strong> · подходы ${escape(row.sets||'—')} · повторы ${escape(row.reps||'—')} · RIR ${escape(row.rir||'—')}</li>`).join('')}</ul></details>`:''}${workout.feeling?`<p class="hint">Самочувствие: ${escape(workout.feeling)}</p>`:''}</article>`;
  }).join('')||'<div class="empty">За этот период нет силовых тренировок для сопоставления.</div>';
 }

 const form=$('#sleepForm');
 $('#sleepRating').innerHTML=qualityLabels.map((title,index)=>`<label title="${index+1} — ${title}"><input class="visually-hidden" type="radio" name="quality" value="${index+1}" aria-label="${index+1} — ${title}"><span aria-hidden="true">☆</span></label>`).join('');
 function formRecord(){return D.sleepRecord({bedtime:form.elements.bedtime.value||null,wakeTime:form.elements.wakeTime.value||null,latency:form.elements.latency.value===''?null:Number(form.elements.latency.value),quality:form.elements.quality.value?Number(form.elements.quality.value):null});}
 function preview(){
  const rating=Number(form.elements.quality.value)||0;
  $('#sleepRating').querySelectorAll('label').forEach((label,index)=>{label.classList.toggle('filled',index<rating);label.querySelector('span').textContent=index<rating?'★':'☆';});
  $('#sleepQualityText').textContent=rating?`${rating}/5 · ${qualityLabels[rating-1]}`:'Не оценено';
  $('#sleepQualityClear').hidden=!rating;
  const day=form.elements.date.value;$('#sleepNightLabel').textContent=D.validDate(day)?`Ночь ${label(S.offset(day,-1))} → ${label(day)}`:'';
  if(!rating&&!['bedtime','wakeTime','latency'].some(field=>form.elements[field].value!=='')){
   $('#sleepPreview').textContent='Запишите время отхода ко сну. Остальное можно добавить утром.';$('#sleepPreview').classList.remove('bad');return;
  }
  try{const values=S.duration(formRecord());$('#sleepPreview').textContent=values.minutes!==null?`Примерная длительность сна: ${hours(values.minutes)}`:values.inBed!==null?`В постели: ${hours(values.inBed)}. Добавьте время засыпания для расчёта сна.`:'Запись можно дополнить утром.';$('#sleepPreview').classList.remove('bad');}
  catch(error){$('#sleepPreview').textContent=error.message;$('#sleepPreview').classList.add('bad');}
 }
 function load(){
  const record=FitApp.read().sleepEntries[form.elements.date.value];
  for(const field of ['bedtime','wakeTime','latency'])form.elements[field].value=record?.[field]??'';
  for(const radio of form.querySelectorAll('[name=quality]'))radio.checked=Number(radio.value)===record?.quality;
  $('#sleepDelete').hidden=!record;$('#sleepFormTitle').textContent=record?'Изменить запись сна':'Запись сна';$('#sleepError').textContent='';preview();
 }
 function open(day){form.reset();form.elements.date.value=day;load();$('#sleepModal').showModal();}
 $('#sleepAdd').onclick=()=>open(I.dateKey(month).slice(0,7)===today().slice(0,7)?today():I.dateKey(month));
 $('#sleepHomeAdd').onclick=()=>open(today());
 for(const id of ['#sleepRows','#sleepHomeBars'])$(id).onclick=event=>{const button=event.target.closest('[data-sleep-date]');if(button)open(button.dataset.sleepDate);};
 $('#sleepClose').onclick=()=>$('#sleepModal').close();
 form.elements.date.onchange=load;
 form.addEventListener('input',preview);
 $('#sleepQualityClear').onclick=()=>{for(const radio of form.querySelectorAll('[name=quality]'))radio.checked=false;preview();};
 form.onsubmit=event=>{
  event.preventDefault();
  try{
   const day=form.elements.date.value;if(!D.validDate(day))throw Error('Проверьте дату пробуждения');
   const record=formRecord(),state=FitApp.read();
   if(!FitApp.update({...state,sleepEntries:{...state.sleepEntries,[day]:record}}))throw Error('Не удалось сохранить сон');
   month=new Date(I.date(day).getFullYear(),I.date(day).getMonth(),1);renderJournal(FitApp.read());$('#sleepModal').close();
  }catch(error){$('#sleepError').textContent=error.message;}
 };
 $('#sleepDelete').onclick=()=>{
  const day=form.elements.date.value;if(!confirm(`Удалить запись сна к ${label(day)}?`))return;
  const state=FitApp.read(),entries={...state.sleepEntries};delete entries[day];
  if(FitApp.update({...state,sleepEntries:entries}))$('#sleepModal').close();
 };
 function render(){try{const state=FitApp.read();renderHome(state);renderJournal(state);}catch{/* Existing storage warning remains visible. */}}
 window.addEventListener('fit:change',render);
 window.addEventListener('fit:stats',event=>{period=event.detail;renderStatistics(FitApp.read());});
 window.matchMedia('(max-width:820px)').addEventListener('change',()=>renderStatistics(FitApp.read()));
 render();try{renderStatistics(FitApp.read());}catch{/* Keep unreadable local data intact. */}
})();
