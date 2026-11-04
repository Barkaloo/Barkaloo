(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'ritm.workouts.v1';
  const types = FitData.types;
  const colors = ['#43795a','#a3bc80','#83adc9','#d6b777','#7d9b9b','#c4b3ce'];
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDate = s => new Date(s+'T12:00:00');
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+parseDate(s)) && localDate(parseDate(s)) === s;
  const fmt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  const dateLabel = s => parseDate(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workouts = [], imports = [], activityDays = {}, draftWorkouts = [], settings = {}, days = 7, editing = null, view = 'overview', metric = 'duration';
  let month = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let journalMonth = new Date(month);
  let storageBroken = false;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {workouts:[],goal:3};
    const normalized=FitData.state(saved);workouts=normalized.workouts;imports=normalized.imports;activityDays=normalized.activityDays;draftWorkouts=normalized.draftWorkouts;settings=normalized.settings;
  } catch {
    storageBroken = true;
    setTimeout(() => toast('Не удалось прочитать сохранённые данные. Экспортируйте исходные данные перед новой записью.'),100);
  }
  let toastTimer;
  function toast(message) { $('#toast').textContent = message; $('#toast').style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').style.display='none',6000); }
  function snapshot(){return FitData.state({workouts,imports,activityDays,draftWorkouts,settings});}
  function saveState(value, notify=true){
    if(storageBroken){toast('Локальные данные повреждены. Сохранение заблокировано, чтобы не потерять исходную копию.');return false;}
    try{const next=FitData.state(value);localStorage.setItem(KEY,JSON.stringify(next));workouts=next.workouts;imports=next.imports;activityDays=next.activityDays;draftWorkouts=next.draftWorkouts;settings=next.settings;if(notify)window.fitCloud?.changed();return true;}
    catch{toast('Не удалось сохранить данные на устройстве');return false;}
  }
  function period() {const end=new Date();end.setHours(0,0,0,0);const start=new Date(end);start.setDate(start.getDate()-days+1);return {start,end};}
  function selected() {const {start,end}=period();return workouts.filter(w=>w.date>=localDate(start)&&w.date<=localDate(end));}
  function sorted(list) {return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));}
  function empty() {return '<div class="empty">Нет тренировок за выбранный период.</div>';}
  function cards(list) {
    return list.length ? sorted(list).map(w=>{
      const draft=!!w.data,source=w.sourceImportId?'ChatGPT':'Вручную';
      const details=w.chatData||w.data;
      return `<article class="workout-card"><div class="workout-card-head"><div><div class="small">${dateLabel(w.date)} · ${source}</div><h3>${escape(w.title)}</h3></div><div class="entry-actions"><button class="icon-btn" data-edit="${escape(w.id)}" aria-label="Редактировать ${escape(w.title)}">✎</button><button class="icon-btn" data-delete="${escape(w.id)}" aria-label="Удалить ${escape(w.title)}">×</button></div></div>${draft?'<p class="muted">Данные получены из ChatGPT. Заполните поля карточки, чтобы учесть тренировку в статистике.</p><button class="btn" data-edit="'+escape(w.id)+'">Заполнить карточку</button>':`<div class="workout-card-metrics"><span class="pill">${escape(w.type)}</span><span>${fmt(w.duration)} мин</span>${w.distance?`<span>${fmt(w.distance)} км</span>`:''}${w.feeling?`<span>${escape(w.feeling)}</span>`:''}</div>${w.treadmillDuration||w.treadmillDistance?`<p class="small">Дорожка: ${fmt(w.treadmillDuration||0)} мин · ${fmt(w.treadmillDistance||0)} км</p>`:''}${w.notes?`<p class="workout-notes">${escape(w.notes)}</p>`:''}`}${details?`<details class="card-source"><summary>Данные из ChatGPT</summary><pre>${escape(JSON.stringify(details,null,2))}</pre></details>`:''}</article>`;
    }).join('') : '<div class="empty">В этом месяце пока нет тренировок. Добавьте карточку вручную или импортируйте данные из ChatGPT на главной.</div>';
  }
  function renderJournal() {
    const key=localDate(journalMonth).slice(0,7);
    $('#journalMonthSelect').value=key;
    $('#entries').innerHTML=cards([...workouts,...draftWorkouts].filter(w=>w.date.startsWith(key)&&(!$('#filter').value||w.type===$('#filter').value)&&(!$('#search').value||w.title.toLocaleLowerCase().includes($('#search').value.toLocaleLowerCase()))));
  }
  function renderChart(list) {
    const {start}=period();
    const totals=Array.from({length:days},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const date=localDate(d), entries=list.filter(w=>w.date===date);return {date,total:metric==='count'?entries.length:metric==='active'?Number(entries.length>0):entries.reduce((sum,w)=>sum+w[metric],0)};});
    const ceiling=Math.max(1,...totals.map(x=>x.total)), W=900,H=300,left=45,bottom=260,top=20,step=(W-left-15)/days;
    const names={duration:'Время тренировок, мин',count:'Количество тренировок',distance:'Дистанция, км',active:'Активные дни'};
    $('#chartTitle').textContent=names[metric];
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${names[metric]} по дням">`;
    for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;svg+=`<line x1="${left}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="0" y="${y+4}" font-size="12">${fmt(ceiling*i/4)}</text>`;}
    totals.forEach((d,i)=>{const h=(bottom-top)*d.total/ceiling,x=left+step*i+step*.2;svg+=`<rect x="${x}" y="${bottom-h}" width="${step*.6}" height="${h}" rx="3" fill="var(--accent)"><title>${dateLabel(d.date)}: ${fmt(d.total)}</title></rect>`;if(days===7||i%Math.ceil(days/7)===0)svg+=`<text x="${left+step*(i+.5)}" y="287" text-anchor="middle" font-size="12">${dateLabel(d.date)}</text>`;});
    $('#chart').innerHTML=svg+'</svg>';
    $('#chartData').innerHTML=totals.map(d=>`<tr><td>${dateLabel(d.date)}</td><td>${fmt(d.total)}</td></tr>`).join('');
  }
  function render() {
    const list=selected(), minutes=list.reduce((s,w)=>s+w.duration,0), {start,end}=period();
    const allMinutes=workouts.reduce((sum,w)=>sum+w.duration,0);
    $('#count').textContent=workouts.length;$('#duration').innerHTML=`${fmt(allMinutes)} <em>мин</em>`;
    const treadDistance=workouts.reduce((sum,w)=>sum+(w.type==='Беговая дорожка'?w.distance:(w.treadmillDistance||0)),0);
    const treadTime=workouts.reduce((sum,w)=>sum+(w.type==='Беговая дорожка'?w.duration:(w.treadmillDuration||0)),0);
    $('#distance').innerHTML=`${fmt(treadDistance)} <em>км</em>`;
    $('#treadmillTime').innerHTML=`${fmt(treadTime)} <em>мин</em>`;
    $('#average').textContent=workouts.length?fmt(allMinutes/workouts.length):'—';
    let streak=0,cursor=new Date();const dates=new Set(Object.keys(activityDays));if(!activityDays[localDate(cursor)])cursor.setDate(cursor.getDate()-1);
    while(dates.has(localDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    $('#streak').textContent=streak;
    $('#metricDuration').textContent=fmt(minutes);$('#metricCount').textContent=list.length;$('#metricDistance').textContent=fmt(list.reduce((sum,w)=>sum+w.distance,0));$('#metricActive').textContent=new Set(list.map(w=>w.date)).size;
    renderChart(list);$('#donutTotal').textContent=fmt(minutes);
    let offset=0;const segments=[];
    $('#legend').innerHTML=types.map((t,i)=>{const total=list.filter(w=>w.type===t).reduce((s,w)=>s+w.duration,0);if(!total)return '';const percent=total/minutes*100;segments.push(`${colors[i]} ${offset}% ${offset+percent}%`);offset+=percent;return `<div class="balance-row"><span><i style="background:${colors[i]}"></i>${t}</span><b>${fmt(total)} мин · ${Math.round(percent)}%</b></div>`;}).join('')||'<div class="empty">Баланс появится после<br>первой тренировки</div>';
    $('#donut').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'#eef1e8';
    renderJournal();
    renderCalendars();
  }
  function renderCalendar(date, titleId, gridId) {
    $(titleId).textContent=date.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const offset=(date.getDay()+6)%7;
    let html='';
    for(let i=0;i<42;i++){
      const d=new Date(date.getFullYear(),date.getMonth(),i-offset+1),key=localDate(d),marked=!!activityDays[key];
      html+=`<button type="button" data-mark-day="${key}" class="day ${d.getMonth()!==date.getMonth()?'muted-day ':''}${marked?'studied ':''}${key===localDate()?'current':''}" aria-label="${dateLabel(key)}: ${marked?'отмечен':'не отмечен'}" aria-pressed="${marked}" title="Двойное нажатие — поставить или убрать отметку">${d.getDate()}</button>`;
    }
    $(gridId).innerHTML=html;
  }
  function renderCalendars() {
    renderCalendar(month,'#month','#calendarGrid');
    renderCalendar(journalMonth,'#journalMonth','#journalCalendarGrid');
  }
  function toggleDay(key) {
    if(!validDate(key))return;
    const next={...activityDays};if(next[key])delete next[key];else next[key]=true;
    if(saveState({...snapshot(),activityDays:next})){render();}
  }
  function switchView(next, push=true) {
    if(!['overview','journal','nutrition','progress','activity'].includes(next))next='overview';
    view=next;['overview','journal','nutrition','progress','activity'].forEach(id=>$('#'+id).hidden=id!==next);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    $('#heading').textContent=({overview:'Спорт',journal:'Журнал тренировок',nutrition:'Учёт КБЖУ и вес',progress:'Статистика',activity:'Активность'})[next];
    if(push&&location.hash!==`#/${next==='overview'?'home':next}`)history.pushState({},'',`#/${next==='overview'?'home':next}`);
    if(matchMedia('(max-width:820px)').matches)closeMenu();
  }
  function openForm(id, date) {
    editing=id||null;$('#form').reset();$('#formError').textContent='';$('#formTitle').textContent=id?'Редактировать тренировку':'Новая тренировка';
    const w=workouts.find(w=>w.id===id),draft=draftWorkouts.find(w=>w.id===id);if(w){for(const key of ['title','type','date','duration','distance','treadmillDuration','treadmillDistance','feeling','notes'])$('#form').elements[key].value=w[key]??'';}else{$('#form').elements.date.value=draft?.date||date||localDate();if(draft)$('#form').elements.title.value=draft.title;}
    $('#form').elements.date.max=localDate();$('#modal').showModal();
  }
  $('#journalAdd').onclick=()=>openForm(null,localDate(journalMonth).slice(0,7)===localDate().slice(0,7)?localDate():localDate(journalMonth));$('#close').onclick=()=>$('#modal').close();
  $('#form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);const w={id:editing||crypto.randomUUID(),title:f.get('title').trim(),type:f.get('type'),date:f.get('date'),duration:Number(f.get('duration')),distance:Number(f.get('distance')||0),treadmillDuration:Number(f.get('treadmillDuration')||0),treadmillDistance:Number(f.get('treadmillDistance')||0),feeling:f.get('feeling'),notes:f.get('notes').trim()};
    if(!w.title||!validDate(w.date)||w.date>localDate()||!Number.isFinite(w.duration)||w.duration<1||w.duration>1440||!Number.isFinite(w.distance)||w.distance<0||w.distance>1000){$('#formError').textContent='Проверьте название, дату и числовые значения. Будущие тренировки пока не учитываются.';return;}
    try{FitData.workout(w);}catch(error){$('#formError').textContent=error.message;return;}
    const original=[...workouts,...draftWorkouts].find(old=>old.id===editing);
    if(original?.sourceImportId){w.sourceImportId=original.sourceImportId;w.chatData=original.chatData||original.data;}
    const next=workouts.some(old=>old.id===editing)?workouts.map(old=>old.id===editing?w:old):[...workouts,w];
    if(saveState({...snapshot(),workouts:next,draftWorkouts:draftWorkouts.filter(old=>old.id!==editing),activityDays:{...activityDays,[w.date]:true}})){$('#modal').close();journalMonth=new Date(parseDate(w.date).getFullYear(),parseDate(w.date).getMonth(),1);render();toast('Тренировка сохранена');}
  };
  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');
    if(edit)openForm(edit.dataset.edit);
    if(del&&confirm('Удалить эту карточку тренировки?')){
      const id=del.dataset.delete;
      if(saveState({...snapshot(),workouts:workouts.filter(w=>w.id!==id),draftWorkouts:draftWorkouts.filter(w=>w.id!==id)})){render();toast('Карточка удалена');}
    }
  });
  document.addEventListener('dblclick',e=>{if(performance.now()<ignoreNativeDblclickUntil)return;const day=e.target.closest('[data-mark-day]');if(day)toggleDay(day.dataset.markDay);});
  document.addEventListener('keydown',e=>{if(e.repeat)return;const day=e.target.closest('[data-mark-day]');if(day&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggleDay(day.dataset.markDay);}});
  // A native double-click works on desktop. Touch needs a double-tap handler;
  // prevent its synthetic click sequence so it cannot toggle a second time.
  let lastTouch=null,ignoreNativeDblclickUntil=0;
  document.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch')return;
    const day=e.target.closest('[data-mark-day]');if(!day){lastTouch=null;return;}
    const now=performance.now();
    if(lastTouch?.element===day&&now-lastTouch.at<400){e.preventDefault();lastTouch=null;ignoreNativeDblclickUntil=now+800;toggleDay(day.dataset.markDay);}else lastTouch={element:day,at:now};
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{days=Number(b.dataset.days);document.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x.dataset.days===b.dataset.days));render();});
  $('#filter').onchange=render;$('#search').oninput=render;
  $('#prev').onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendars();};$('#next').onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendars();};
  $('#todayMonth').onclick=()=>{month=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendars();};
  $('#journalPrev').onclick=()=>{journalMonth.setMonth(journalMonth.getMonth()-1);renderCalendars();renderJournal();};
  $('#journalNext').onclick=()=>{journalMonth.setMonth(journalMonth.getMonth()+1);renderCalendars();renderJournal();};
  $('#journalToday').onclick=()=>{journalMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendars();renderJournal();};
  $('#journalMonthSelect').onchange=e=>{const value=e.target.value;if(!/^\d{4}-\d{2}$/.test(value)||!validDate(value+'-01')){renderJournal();return;}const d=parseDate(value+'-01');journalMonth=new Date(d.getFullYear(),d.getMonth(),1);renderCalendars();renderJournal();};
  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b?'true':'false');});renderChart(selected());});
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
      const created=FitData.importCards(payload,id,localDate());
      const existing=new Set([...workouts,...draftWorkouts].map(w=>w.id));
      const newWorkouts=created.workouts.filter(w=>!existing.has(w.id)),newDrafts=created.draftWorkouts.filter(w=>!existing.has(w.id));
      const imported=imports.some(i=>i.id===id);
      if(imported&&!newWorkouts.length&&!newDrafts.length){status.textContent='Эта запись уже сохранена';status.className='status';return;}
      if(!saveState({...snapshot(),imports:imported?imports:[...imports,{id,receivedAt:new Date().toISOString(),payload}],workouts:[...workouts,...newWorkouts],draftWorkouts:[...draftWorkouts,...newDrafts],activityDays:{...activityDays,...Object.fromEntries(newWorkouts.map(w=>[w.date,true]))}}))throw Error('Не удалось сохранить запись');
      status.textContent=newWorkouts.length+newDrafts.length?`Данные сохранены. Карточек в журнале: ${newWorkouts.length+newDrafts.length}.`:'Исходные данные сохранены. Распознавание показателей настроим позже.';status.className='status good';$('#chatData').value='';render();
    }catch(error){status.textContent=error.message;status.className='status bad';}finally{button.disabled=false;}
  };
  window.FitApp={read(){if(storageBroken)throw Error("Локальное хранилище повреждено. Синхронизация остановлена.");return snapshot();},apply(value){if(!saveState(value,false))throw Error('Не удалось сохранить облачную версию');render();},download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  $('#exportBackup').onclick=()=>{try{const value=storageBroken?JSON.parse(localStorage.getItem(KEY)):snapshot();FitApp.download(value,'barkaloo-fit-backup.json');}catch{toast('Не удалось прочитать исходное хранилище');}};
  $('#restoreBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('Файл больше 5 МБ');const value=FitData.state(JSON.parse(await file.text()));if(!confirm('Заменить текущие фитнес-данные резервной копией?'))return;if(saveState(value)){render();toast('Резервная копия восстановлена');}}catch(error){toast('Не удалось восстановить данные: '+error.message);}finally{e.target.value='';}};
  switchView(location.hash.slice(2)==='home'?'overview':location.hash.slice(2),false);
  render();
})();
