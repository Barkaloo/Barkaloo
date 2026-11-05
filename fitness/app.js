(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'ritm.workouts.v1';
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDate = s => new Date(s+'T12:00:00');
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+parseDate(s)) && localDate(parseDate(s)) === s;
  const fmt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  const dateLabel = s => parseDate(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workouts = [], imports = [], activityDays = {}, trainingDays = {}, draftWorkouts = [], dailyEntries = {}, settings = {}, extraActivity = {}, measurements = {}, sleepEntries = {}, weightGoal = null, editing = null, view = 'overview';
  let month = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let journalMonth = new Date(month);
  let nutritionMonth = new Date(month);
  let storageBroken = false;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {workouts:[],goal:3};
    const normalized=FitData.state(saved);workouts=normalized.workouts;imports=normalized.imports;activityDays=normalized.activityDays;trainingDays=normalized.trainingDays;draftWorkouts=normalized.draftWorkouts;dailyEntries=normalized.dailyEntries;settings=normalized.settings;extraActivity=normalized.extraActivity;measurements=normalized.measurements;sleepEntries=normalized.sleepEntries;weightGoal=normalized.weightGoal;
  } catch {
    storageBroken = true;
    setTimeout(() => toast('Не удалось прочитать сохранённые данные. Экспортируйте исходные данные перед новой записью.'),100);
  }
  let toastTimer;
  function toast(message) { $('#toast').textContent = message; $('#toast').style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').style.display='none',6000); }
  function snapshot(){return FitData.state({workouts,imports,activityDays,trainingDays,draftWorkouts,dailyEntries,settings,extraActivity,measurements,sleepEntries,weightGoal});}
  function saveState(value, notify=true){
    if(storageBroken){toast('Локальные данные повреждены. Сохранение заблокировано, чтобы не потерять исходную копию.');return false;}
    try{const next=FitInsights.anchorGoal(FitData.state(value),localDate());localStorage.setItem(KEY,JSON.stringify(next));workouts=next.workouts;imports=next.imports;activityDays=next.activityDays;trainingDays=next.trainingDays;draftWorkouts=next.draftWorkouts;dailyEntries=next.dailyEntries;settings=next.settings;extraActivity=next.extraActivity;measurements=next.measurements;sleepEntries=next.sleepEntries;weightGoal=next.weightGoal;if(notify)window.fitCloud?.changed();return true;}
    catch{toast('Не удалось сохранить данные на устройстве');return false;}
  }
  function sorted(list) {return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));}
  function empty() {return '<div class="empty">Нет тренировок за выбранный период.</div>';}
  function tableRows(w){return w.format==='strength-table-v1'?w.exercises:FitData.exerciseRows(w.chatData||w.data||w);}
  function strengthEntries(){return [...workouts.filter(w=>w.type==='Силовая'),...draftWorkouts.filter(w=>!w.data.type||w.data.type==='Силовая')];}
  function cards(list) {
    if(!list.length)return '<div class="empty">В этом месяце пока нет силовых тренировок. Добавьте пустую таблицу или импортируйте запись из ChatGPT.</div>';
    const groups=new Map();
    sorted(list).forEach(w=>{const monday=parseDate(w.date);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);const key=localDate(monday);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w);});
    return [...groups].map(([week,entries])=>{
      const first=new Date(journalMonth),last=new Date(journalMonth.getFullYear(),journalMonth.getMonth()+1,0),start=parseDate(week),end=parseDate(week);end.setDate(end.getDate()+6);
      const from=localDate(start<first?first:start),to=localDate(end>last?last:end);
      const label=from===to?dateLabel(from):`${dateLabel(from)} — ${dateLabel(to)}`;
      return `<section class="training-week"><div class="training-week-head"><h3>${label}</h3><span>${entries.length} трен.</span></div>${entries.map(w=>{
        const source=w.sourceImportId?'ChatGPT':'Вручную',details=w.chatData||w.data;
        const rows=tableRows(w);
        return `<article class="workout-card"><div class="workout-card-head"><div><h3>${dateLabel(w.date)}<span class="workout-weekday">${parseDate(w.date).toLocaleDateString('ru-RU',{weekday:'long'})}</span></h3><span class="small">${source}</span><span class="workout-duration">${Number.isFinite(w.duration)?fmt(w.duration)+' мин':'Время не указано'}</span></div><div class="entry-actions"><button class="icon-btn" data-edit="${escape(w.id)}" aria-label="Редактировать тренировку ${dateLabel(w.date)}" title="Редактировать">✎</button><button class="icon-btn" data-delete="${escape(w.id)}" aria-label="Удалить тренировку ${dateLabel(w.date)}" title="Удалить">×</button></div></div><div class="strength-table-wrap"><table class="strength-table"><caption class="visually-hidden">Силовая тренировка ${dateLabel(w.date)}</caption><thead><tr><th scope="col">Упражнение</th><th scope="col">Подходы</th><th scope="col">Повторы</th><th scope="col">RIR</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(row.exercise)||'—'}</td><td>${escape(row.sets)||'—'}</td><td>${escape(row.reps)||'—'}</td><td>${escape(row.rir)||'—'}</td></tr>`).join('')}</tbody></table></div>${details?`<details class="card-source"><summary>Данные из ChatGPT</summary><pre>${escape(JSON.stringify(details,null,2))}</pre></details>`:''}${w.notes?`<details class="card-source"><summary>Ранее сохранённые заметки</summary><p class="workout-notes">${escape(w.notes)}</p></details>`:''}</article>`;
      }).join('')}</section>`;
    }).join('');
  }
  function renderJournal() {
    const key=localDate(journalMonth).slice(0,7);
    $('#journalMonthSelect').value=key;
    const entries=strengthEntries().filter(w=>w.date.startsWith(key));
    $('#journalSummary').textContent=`${journalMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})} · Тренировок: ${entries.length}`;
    $('#entries').innerHTML=cards(entries);
  }
  function renderNutrition(){
    const key=localDate(nutritionMonth).slice(0,7),last=new Date(nutritionMonth.getFullYear(),nutritionMonth.getMonth()+1,0).getDate();
    $('#nutritionMonthSelect').value=key;
    const filled=Object.keys(dailyEntries).filter(date=>date.startsWith(key)).length;
    $('#nutritionSummary').textContent=`Заполнено дней: ${filled}`;
    const labels={calories:'Ккал',protein:'Белки, г',fat:'Жиры, г',carbs:'Углеводы, г',weight:'Вес утром, кг'};
    let html='';
    for(let day=1;day<=last;day++){
      const date=localDate(new Date(nutritionMonth.getFullYear(),nutritionMonth.getMonth(),day)),entry=dailyEntries[date];
      html+=`<tr data-daily-date="${date}" class="${entry?'has-entry ':''}${date===localDate()?'today':''}"><th scope="row"><span class="daily-date">${dateLabel(date)}</span><span class="daily-weekday">${parseDate(date).toLocaleDateString('ru-RU',{weekday:'short'})}</span></th>${FitData.dailyFields.map(field=>`<td data-label="${labels[field]}">${entry?.[field]===null||entry?.[field]===undefined?'—':fmt(entry[field])}</td>`).join('')}<td class="daily-action"><button class="mini-btn" data-edit-day="${date}" aria-label="${entry?'Изменить':'Заполнить'} запись за ${dateLabel(date)}">${entry?'Изменить':'Заполнить'}</button></td></tr>`;
    }
    $('#nutritionDays').innerHTML=html;
  }
  function loadDailyFields(){
    const form=$('#nutritionForm'),date=form.elements.date.value,entry=dailyEntries[date];
    for(const field of FitData.dailyFields)form.elements[field].value=entry?.[field]??'';
    $('#nutritionDelete').hidden=!entry;$('#nutritionError').textContent='';
  }
  function openDailyForm(date){
    $('#nutritionForm').reset();$('#nutritionForm').elements.date.value=date;loadDailyFields();$('#nutritionModal').showModal();
  }
  $('#nutritionAdd').onclick=()=>openDailyForm(localDate(nutritionMonth).slice(0,7)===localDate().slice(0,7)?localDate():localDate(nutritionMonth));
  $('#nutritionClose').onclick=()=>$('#nutritionModal').close();
  $('#nutritionForm').elements.date.onchange=loadDailyFields;
  $('#nutritionForm').onsubmit=e=>{
    e.preventDefault();const form=e.target,date=form.elements.date.value;
    try{
      if(!validDate(date))throw Error('Проверьте дату');
      const entry=FitData.dailyRecord(Object.fromEntries(FitData.dailyFields.map(key=>[key,form.elements[key].value===''?null:Number(form.elements[key].value)])));
      if(saveState({...snapshot(),dailyEntries:{...dailyEntries,[date]:entry}})){$('#nutritionModal').close();nutritionMonth=new Date(parseDate(date).getFullYear(),parseDate(date).getMonth(),1);render();toast('Запись за день сохранена');}
    }catch(error){$('#nutritionError').textContent=error.message;}
  };
  $('#nutritionDelete').onclick=()=>{
    const date=$('#nutritionForm').elements.date.value;
    if(!dailyEntries[date]||!confirm(`Удалить питание и вес за ${dateLabel(date)}?`))return;
    const next={...dailyEntries};delete next[date];if(saveState({...snapshot(),dailyEntries:next})){$('#nutritionModal').close();render();toast('Запись за день удалена');}
  };
  $('#nutritionPrev').onclick=()=>{nutritionMonth.setMonth(nutritionMonth.getMonth()-1);renderNutrition();};
  $('#nutritionNext').onclick=()=>{nutritionMonth.setMonth(nutritionMonth.getMonth()+1);renderNutrition();};
  $('#nutritionToday').onclick=()=>{nutritionMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderNutrition();};
  $('#nutritionMonthSelect').onchange=e=>{const key=e.target.value;if(!/^\d{4}-\d{2}$/.test(key)||!validDate(key+'-01')){renderNutrition();return;}const date=parseDate(key+'-01');nutritionMonth=new Date(date.getFullYear(),date.getMonth(),1);renderNutrition();};
  function render() {
    const timed=workouts.filter(w=>Number.isFinite(w.duration)&&w.duration>0),allMinutes=timed.reduce((sum,w)=>sum+w.duration,0);
    $('#count').textContent=workouts.length;$('#duration').innerHTML=timed.length?`${fmt(allMinutes)} <em>мин</em>`:'—';
    const treadmill=FitInsights.treadmillSummary(FitInsights.treadmillRecords(snapshot()));
    $('#distance').innerHTML=treadmill.distance===null?'—':`${fmt(treadmill.distance)} <em>км</em>`;
    $('#treadmillTime').innerHTML=treadmill.average===null?'—':`${fmt(treadmill.average)} <em>мин</em>`;
    $('#average').textContent=timed.length?fmt(allMinutes/timed.length):'—';
    let streak=0,cursor=new Date();const dates=new Set(Object.keys(activityDays));if(!activityDays[localDate(cursor)])cursor.setDate(cursor.getDate()-1);
    while(dates.has(localDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    $('#streak').textContent=streak;
    renderJournal();
    renderCalendars();
    renderNutrition();
    window.dispatchEvent(new CustomEvent('fit:change'));
  }
  function renderCalendar(date, titleId, gridId, marks, calendar) {
    $(titleId).textContent=date.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const offset=(date.getDay()+6)%7;
    let html='';
    for(let i=0;i<42;i++){
      const d=new Date(date.getFullYear(),date.getMonth(),i-offset+1),key=localDate(d),marked=!!marks[key];
      html+=`<button type="button" data-calendar="${calendar}" data-mark-day="${key}" class="day ${d.getMonth()!==date.getMonth()?'muted-day ':''}${marked?'studied ':''}${key===localDate()?'current':''}" aria-label="${dateLabel(key)}: ${marked?'отмечен':'не отмечен'}" aria-pressed="${marked}" title="Двойное нажатие — поставить или убрать отметку">${d.getDate()}</button>`;
    }
    $(gridId).innerHTML=html;
  }
  function renderCalendars() {
    renderCalendar(month,'#month','#calendarGrid',activityDays,'home');
    renderCalendar(journalMonth,'#journalMonth','#journalCalendarGrid',trainingDays,'training');
  }
  function toggleDay(key,calendar) {
    if(!validDate(key))return;
    const field=calendar==='training'?'trainingDays':'activityDays',next={...(field==='trainingDays'?trainingDays:activityDays)};if(next[key])delete next[key];else next[key]=true;
    if(saveState({...snapshot(),[field]:next})){render();}
  }
  function switchView(next, push=true) {
    if(!['overview','journal','nutrition','progress','activity','sleep'].includes(next))next='overview';
    view=next;['overview','journal','nutrition','progress','activity','sleep'].forEach(id=>$('#'+id).hidden=id!==next);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    $('#heading').textContent=({overview:'Спорт',journal:'Журнал тренировок',nutrition:'Учёт КБЖУ и вес',progress:'Статистика',activity:'Активность',sleep:'Сон'})[next];
    if(push&&location.hash!==`#/${next==='overview'?'home':next}`)history.pushState({},'',`#/${next==='overview'?'home':next}`);
    if(matchMedia('(max-width:820px)').matches)closeMenu();
    if(push)window.scrollTo(0,0);
  }
  function readExerciseRows(){
    return [...$('#exerciseRows').querySelectorAll('tr')].map(row=>Object.fromEntries(['exercise','sets','reps','rir'].map(key=>[key,row.querySelector(`[data-exercise-field="${key}"]`).value.trim()])));
  }
  function renderExerciseRows(rows){
    $('#exerciseRows').innerHTML=rows.map((row,index)=>`<tr><td><div class="exercise-name-input"><input data-exercise-field="exercise" aria-label="Упражнение, строка ${index+1}" maxlength="200" value="${escape(row.exercise)}" placeholder="Упражнение"><button type="button" class="icon-btn" data-remove-exercise="${index}" aria-label="Удалить упражнение, строка ${index+1}" title="Удалить строку">×</button></div></td><td><input data-exercise-field="sets" aria-label="Подходы, строка ${index+1}" inputmode="numeric" maxlength="3" value="${escape(row.sets)}" placeholder="—"></td><td><input data-exercise-field="reps" aria-label="Повторы, строка ${index+1}" maxlength="64" value="${escape(row.reps)}" placeholder="—"></td><td><input data-exercise-field="rir" aria-label="RIR, строка ${index+1}" maxlength="64" value="${escape(row.rir)}" placeholder="—"></td></tr>`).join('');
  }
  function openForm(id, date) {
    editing=id||null;$('#form').reset();$('#formError').textContent='';$('#formTitle').textContent=id?'Редактировать тренировку':'Новая тренировка';
    const w=strengthEntries().find(w=>w.id===id);
    $('#form').elements.date.value=w?.date||date||localDate();
    $('#form').elements.date.max=localDate();
    $('#form').elements.duration.value=w?.duration??'';
    renderExerciseRows(w?tableRows(w):[FitData.blankExercise()]);
    $('#modal').showModal();
  }
  $('#addExercise').onclick=()=>{const rows=readExerciseRows();if(rows.length>=100){$('#formError').textContent='В одной таблице можно сохранить до 100 упражнений';return;}renderExerciseRows([...rows,FitData.blankExercise()]);$('#exerciseRows tr:last-child input').focus();};
  $('#exerciseRows').onclick=e=>{const remove=e.target.closest('[data-remove-exercise]');if(!remove)return;const rows=readExerciseRows();rows.splice(Number(remove.dataset.removeExercise),1);renderExerciseRows(rows.length?rows:[FitData.blankExercise()]);};
  $('#journalAdd').onclick=()=>openForm(null,localDate(journalMonth).slice(0,7)===localDate().slice(0,7)?localDate():localDate(journalMonth));$('#close').onclick=()=>$('#modal').close();
  $('#form').onsubmit=e=>{
    e.preventDefault();
    const date=$('#form').elements.date.value;
    if(!validDate(date)||date>localDate()){$('#formError').textContent='Проверьте дату тренировки';return;}
    const original=[...workouts,...draftWorkouts].find(old=>old.id===editing);
    const w={...original,id:editing||crypto.randomUUID(),title:original?.title||'Силовая тренировка',type:'Силовая',format:'strength-table-v1',date,duration:$('#form').elements.duration.value===''?null:Number($('#form').elements.duration.value),distance:original?.distance??0,exercises:readExerciseRows()};
    delete w.data;
    if(original?.sourceImportId){w.sourceImportId=original.sourceImportId;w.chatData=original.chatData||original.data;}
    try{FitData.workout(w);}catch(error){$('#formError').textContent=error.message;return;}
    const next=workouts.some(old=>old.id===editing)?workouts.map(old=>old.id===editing?w:old):[...workouts,w];
    if(saveState({...snapshot(),workouts:next,draftWorkouts:draftWorkouts.filter(old=>old.id!==editing),trainingDays:{...trainingDays,[w.date]:true}})){$('#modal').close();journalMonth=new Date(parseDate(w.date).getFullYear(),parseDate(w.date).getMonth(),1);render();toast('Тренировка сохранена');}
  };
  document.addEventListener('click',e=>{
    const day=e.target.closest('[data-edit-day]');if(day){openDailyForm(day.dataset.editDay);return;}
    const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');
    if(edit)openForm(edit.dataset.edit);
    if(del&&confirm('Удалить эту карточку тренировки?')){
      const id=del.dataset.delete;
      if(saveState({...snapshot(),workouts:workouts.filter(w=>w.id!==id),draftWorkouts:draftWorkouts.filter(w=>w.id!==id)})){render();toast('Карточка удалена');}
    }
  });
  document.addEventListener('dblclick',e=>{if(performance.now()<ignoreNativeDblclickUntil)return;const day=e.target.closest('[data-mark-day]');if(day)toggleDay(day.dataset.markDay,day.dataset.calendar);});
  document.addEventListener('keydown',e=>{if(e.repeat)return;const day=e.target.closest('[data-mark-day]');if(day&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggleDay(day.dataset.markDay,day.dataset.calendar);}});
  // A native double-click works on desktop. Touch needs a double-tap handler;
  // prevent its synthetic click sequence so it cannot toggle a second time.
  let lastTouch=null,ignoreNativeDblclickUntil=0;
  document.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch')return;
    const day=e.target.closest('[data-mark-day]');if(!day){lastTouch=null;return;}
    const now=performance.now();
    if(lastTouch?.element===day&&now-lastTouch.at<400){e.preventDefault();lastTouch=null;ignoreNativeDblclickUntil=now+800;toggleDay(day.dataset.markDay,day.dataset.calendar);}else lastTouch={element:day,at:now};
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#prev').onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendars();};$('#next').onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendars();};
  $('#todayMonth').onclick=()=>{month=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendars();};
  $('#journalPrev').onclick=()=>{journalMonth.setMonth(journalMonth.getMonth()-1);renderCalendars();renderJournal();};
  $('#journalNext').onclick=()=>{journalMonth.setMonth(journalMonth.getMonth()+1);renderCalendars();renderJournal();};
  $('#journalToday').onclick=()=>{journalMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendars();renderJournal();};
  $('#journalMonthSelect').onchange=e=>{const value=e.target.value;if(!/^\d{4}-\d{2}$/.test(value)||!validDate(value+'-01')){renderJournal();return;}const d=parseDate(value+'-01');journalMonth=new Date(d.getFullYear(),d.getMonth(),1);renderCalendars();renderJournal();};
  function closeMenu() {$('#sidebar').classList.remove('show');$('#overlay').classList.remove('show');$('#burger').setAttribute('aria-expanded','false');}
  $('#burger').onclick=()=>{if(matchMedia('(max-width:820px)').matches){const open=$('#sidebar').classList.toggle('show');$('#overlay').classList.toggle('show',open);$('#burger').setAttribute('aria-expanded',String(open));}else{const hidden=$('#sidebar').classList.toggle('hidden');$('#main').classList.toggle('expanded',hidden);$('#burger').setAttribute('aria-expanded',String(!hidden));}};
  $('#overlay').onclick=closeMenu;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  let theme='system';try{theme=localStorage.getItem('barkaloo_fitness_theme')||'system';}catch{}
  if(!['system','light','dark'].includes(theme))theme='system';
  const systemTheme=matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(){const resolved=theme==='system'?(systemTheme.matches?'dark':'light'):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;$('#appThemeColor').content=resolved==='dark'?'#101114':'#edf4ef';}
  $('#themeSelect').value=theme;$('#themeSelect').onchange=e=>{theme=e.target.value;try{localStorage.setItem('barkaloo_fitness_theme',theme);}catch{toast('Настройку темы не удалось сохранить');}applyTheme();};systemTheme.addEventListener('change',applyTheme);applyTheme();
  window.addEventListener('popstate',()=>switchView(location.hash.slice(2)==='home'?'overview':location.hash.slice(2),false));
  $('#importToggle').onclick=()=>{const open=$('#importBox').classList.toggle('show');$('#importToggle').setAttribute('aria-expanded',String(open));};
  $('#saveChatData').onclick=async()=>{
    const button=$('#saveChatData'),status=$('#importStatus');button.disabled=true;
    try{
      const text=$('#chatData').value.trim();if(!text||text.length>500000)throw Error('Вставьте JSON до 500 КБ');
      let payload;try{payload=JSON.parse(text);}catch{throw Error('Не удалось прочитать JSON. Проверьте формат данных.');}
      if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Ожидается JSON-объект с данными за день');
      if(payload.date!==undefined&&!validDate(payload.date))throw Error('Дата должна быть в формате ГГГГ-ММ-ДД');
      const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(payload)));
      const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const created=FitData.importCards(payload,id,localDate()),nutrition=FitData.nutritionPatch(payload,localDate());
      const existing=new Set([...workouts,...draftWorkouts].map(w=>w.id));
      const newWorkouts=created.workouts.filter(w=>!existing.has(w.id)),newDrafts=created.draftWorkouts.filter(w=>!existing.has(w.id));
      const imported=imports.some(i=>i.id===id);
      if(imported&&!newWorkouts.length&&!newDrafts.length){status.textContent='Эта запись уже сохранена';status.className='status';return;}
      const sleep=!imported?FitData.sleepPatch(payload,localDate(),sleepEntries):null;
      const nextDaily={...dailyEntries};if(nutrition&&!imported)nextDaily[nutrition.date]=FitData.dailyRecord({...nextDaily[nutrition.date],...nutrition.values});
      const nextActivity={...extraActivity},nextMeasurements={...measurements};if(!imported&&(payload.activity||payload.measurements)){const date=payload.date??localDate();if(!validDate(date))throw Error('Проверьте дату активности или замеров');if(payload.activity)nextActivity[date]=FitData.activityRecord({...nextActivity[date],...payload.activity});if(payload.measurements)nextMeasurements[date]=FitData.measurementRecord({...nextMeasurements[date],...payload.measurements});}
      if(!saveState({...snapshot(),dailyEntries:nextDaily,extraActivity:nextActivity,measurements:nextMeasurements,sleepEntries:sleep?{...sleepEntries,[sleep.date]:sleep.record}:sleepEntries,imports:imported?imports:[...imports,{id,receivedAt:new Date().toISOString(),payload}],workouts:[...workouts,...newWorkouts],draftWorkouts:[...draftWorkouts,...newDrafts],trainingDays:{...trainingDays,...Object.fromEntries(newWorkouts.map(w=>[w.date,true]))}}))throw Error('Не удалось сохранить запись');
      status.textContent=newWorkouts.length+newDrafts.length?`Данные сохранены. Карточек в журнале: ${newWorkouts.length+newDrafts.length}.`:(nutrition||sleep||payload.activity||payload.measurements?'Данные за день сохранены.':'Исходные данные сохранены. Распознавание показателей настроим позже.');status.className='status good';$('#chatData').value='';render();
    }catch(error){status.textContent=error.message;status.className='status bad';}finally{button.disabled=false;}
  };
  window.FitApp={update(value){if(!saveState(value))return false;render();return true;},read(){if(storageBroken)throw Error("Локальное хранилище повреждено. Синхронизация остановлена.");return snapshot();},apply(value){if(!saveState(value,false))throw Error('Не удалось сохранить облачную версию');render();},download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  $('#exportBackup').onclick=()=>{try{const value=storageBroken?JSON.parse(localStorage.getItem(KEY)):snapshot();FitApp.download(value,'barkaloo-fit-backup.json');}catch{toast('Не удалось прочитать исходное хранилище');}};
  $('#restoreBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('Файл больше 5 МБ');const value=FitData.state(JSON.parse(await file.text()));if(!confirm('Заменить текущие фитнес-данные резервной копией?'))return;if(saveState(value)){render();toast('Резервная копия восстановлена');}}catch(error){toast('Не удалось восстановить данные: '+error.message);}finally{e.target.value='';}};
  switchView(location.hash.slice(2)==='home'?'overview':location.hash.slice(2),false);
  render();
})();
