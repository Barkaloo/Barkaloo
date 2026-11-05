(() => {
 'use strict';
 const $=selector=>document.querySelector(selector),D=FitData,V=FitVolume;
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateLabel=key=>new Date(key+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const muscleNames=keys=>keys.map(key=>D.muscleGroups[key]).join(', ')||'—';
 let period={from:$('#statsFrom').value,to:$('#statsTo').value},editing=null;
 function render(state){
  if(!D.validDate(period.from)||!D.validDate(period.to))return;
  const volume=V.summary(state,period.from,period.to),catalogue=V.catalogue(state);
  $('#volumePeriod').textContent=`${dateLabel(period.from)} — ${dateLabel(period.to)} · подходы по записям журнала`;
  $('#volumeSummary').textContent=`Тренировок: ${volume.workoutCount} · Подходов с назначенными мышцами: ${volume.countedSets} из ${volume.totalSets}`;
  const groups=volume.groups.filter(group=>$('#volumeShowZero').checked||group.primary||group.secondary);
  const max=Math.max(1,...volume.groups.flatMap(group=>[group.primary,group.secondary]));
  const open=new Set([...$('#volumeGroups').querySelectorAll('details[open]')].map(element=>element.dataset.volumeGroup));
  $('#volumeGroups').innerHTML=groups.map(group=>`<details class="volume-group" data-volume-group="${group.key}" ${open.has(group.key)?'open':''}><summary><div class="volume-group-head"><strong>${group.label}</strong><span><b>${group.primary}</b> прямых · <b>${group.secondary}</b> косвенных</span></div><div class="volume-bars" aria-hidden="true"><div><i style="width:${group.primary/max*100}%"></i></div><div class="indirect"><i style="width:${group.secondary/max*100}%"></i></div></div></summary><div class="volume-group-details"><h3>По неделям</h3><div class="table-scroll"><table class="summary-table"><thead><tr><th>Неделя с записями</th><th>Прямые</th><th>Косвенные</th></tr></thead><tbody>${volume.weeks.map(week=>`<tr><td>${dateLabel(week.from)} — ${dateLabel(week.to)}</td><td>${week.groups[group.key].primary}</td><td>${week.groups[group.key].secondary}</td></tr>`).join('')||'<tr><td colspan="3">Нет тренировок за период</td></tr>'}</tbody></table></div><h3>Из каких упражнений</h3><ul class="volume-sources">${group.contributions.map(row=>`<li><span>${dateLabel(row.date)} · ${escape(row.exercise)}</span><strong>${row.sets} ${row.role==='primary'?'прямых':'косвенных'}</strong></li>`).join('')||'<li>Нет подходов за выбранный период</li>'}</ul></div></details>`).join('')||'<div class="empty">За этот период нет подходов с назначенными мышечными группами.</div>';
  $('#volumeUnmapped').hidden=!volume.unknown.length;
  $('#volumeUnmapped').innerHTML=volume.unknown.length?`<h3>Назначьте мышцы для упражнений</h3><p class="hint">Эти записи пока не распределены по группам.</p>${volume.unknown.map(entry=>`<div class="volume-unmapped-row"><span>${escape(entry.label)}<small>Подходов с указанным числом: ${entry.sets}</small></span><button class="mini-btn" data-volume-edit="${escape(entry.key)}">Назначить мышцы</button></div>`).join('')}`:'';
  $('#volumeMissing').textContent=volume.missingSets?`Строк без числа подходов: ${volume.missingSets}. Дополните их в журнале, чтобы учесть объём.`:'';
  $('#volumeCatalogue').innerHTML=catalogue.map(entry=>`<article class="volume-catalogue-row"><div><strong>${escape(entry.label)}</strong><p><span>Основные:</span> ${entry.mapped?muscleNames(entry.primary):'не назначены'}</p><p><span>Вспомогательные:</span> ${muscleNames(entry.secondary)}</p></div><button class="mini-btn" data-volume-edit="${escape(entry.key)}">${entry.mapped?'Изменить':'Назначить'}</button></article>`).join('');
  $('#muscleExerciseNames').innerHTML=catalogue.map(entry=>`<option value="${escape(entry.label)}"></option>`).join('');
 }
 $('#volumeShowZero').onchange=()=>render(FitApp.read());
 $('#volumeThisWeek').onclick=()=>{
  const today=FitInsights.dateKey(new Date()),monday=V.monday(today);
  $('#statsFrom').value=monday;$('#statsTo').value=V.offset(monday,6);$('#statsPeriodForm').requestSubmit();
 };
 function open(key){
  const entry=V.catalogue(FitApp.read()).find(item=>item.key===key);if(!entry)return;
  editing=entry;$('#volumeExerciseName').textContent=entry.label;$('#volumeError').textContent='';
  $('#volumeRoles').innerHTML=Object.entries(D.muscleGroups).map(([group,label])=>`<label class="volume-role-row"><span>${label}</span><select data-muscle-role="${group}" aria-label="${label}"><option value="none">Не учитывать</option><option value="primary" ${entry.primary.includes(group)?'selected':''}>Основная</option><option value="secondary" ${entry.secondary.includes(group)?'selected':''}>Вспомогательная</option></select></label>`).join('');
  $('#volumeReset').hidden=!entry.customized;$('#volumeModal').showModal();
 }
 for(const id of ['#volumeCatalogue','#volumeUnmapped'])$(id).onclick=event=>{const button=event.target.closest('[data-volume-edit]');if(button)open(button.dataset.volumeEdit);};
 $('#volumeClose').onclick=()=>$('#volumeModal').close();
 $('#volumeForm').onsubmit=event=>{
  event.preventDefault();if(!editing)return;
  try{
   const mapping={label:editing.label,primary:[],secondary:[]};
   for(const select of $('#volumeRoles').querySelectorAll('[data-muscle-role]'))if(select.value!=='none')mapping[select.value].push(select.dataset.muscleRole);
   const valid=D.exerciseMapping(mapping),state=FitApp.read();
   if(!FitApp.update({...state,settings:{...state.settings,exerciseMuscles:{...state.settings.exerciseMuscles,[editing.key]:valid}}}))throw Error('Не удалось сохранить привязку');
   $('#volumeModal').close();
  }catch(error){$('#volumeError').textContent=error.message;}
 };
 $('#volumeReset').onclick=()=>{
  if(!editing)return;const state=FitApp.read(),overrides={...state.settings.exerciseMuscles};delete overrides[editing.key];
  const settings={...state.settings};if(Object.keys(overrides).length)settings.exerciseMuscles=overrides;else delete settings.exerciseMuscles;
  if(FitApp.update({...state,settings}))$('#volumeModal').close();
 };
 window.addEventListener('fit:stats',event=>{period=event.detail;render(FitApp.read());});
 try{render(FitApp.read());}catch{/* Existing storage error protects the original data. */}
})();
