(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'ritm.workouts.v1';
  const types = FitData.types;
  const colors = ['#43795a','#a3bc80','#83adc9','#d6b777','#7d9b9b','#c4b3ce'];
  const icons = ['↟','⌁','◎','↗','✳'];
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDate = s => new Date(s+'T12:00:00');
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+parseDate(s)) && localDate(parseDate(s)) === s;
  const fmt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  const dateLabel = s => parseDate(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workouts = [], imports = [], settings = {}, days = 7, editing = null, view = 'overview', metric = 'duration';
  let month = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let storageBroken = false;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {workouts:[],goal:3};
    const normalized=FitData.state(saved);workouts=normalized.workouts;imports=normalized.imports;settings=normalized.settings;
  } catch {
    storageBroken = true;
    setTimeout(() => toast('Не удалось прочитать сохранённые данные. Экспортируйте исходные данные перед новой записью.'),100);
  }
  let toastTimer;
  function toast(message) { $('#toast').textContent = message; $('#toast').style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').style.display='none',6000); }
  function snapshot(){return FitData.state({workouts,imports,settings});}
  function saveState(value, notify=true){
    if(storageBroken){toast('Локальные данные повреждены. Сохранение заблокировано, чтобы не потерять исходную копию.');return false;}
    try{const next=FitData.state(value);localStorage.setItem(KEY,JSON.stringify(next));workouts=next.workouts;imports=next.imports;settings=next.settings;if(notify)window.fitCloud?.changed();return true;}
    catch{toast('Не удалось сохранить данные на устройстве');return false;}
  }
  function persist(next){return saveState({...snapshot(),workouts:next});}
  function period() {const end=new Date();end.setHours(0,0,0,0);const start=new Date(end);start.setDate(start.getDate()-days+1);return {start,end};}
  function selected() {const {start,end}=period();return workouts.filter(w=>w.date>=localDate(start)&&w.date<=localDate(end));}
  function sorted(list) {return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));}
  function empty() {return '<div class="empty">Нет тренировок за выбранный период.</div>';}
  function rows(list) {
    return list.length ? sorted(list).map(w=>`<div class="table-row"><div><div class="workout-title">${escape(w.title)}</div>${w.notes?`<div class="workout-notes">${escape(w.notes)}</div>`:''}</div><div><span class="pill">${escape(w.type)}</span><div class="small">${dateLabel(w.date)} · ${escape(w.feeling||'Хорошо')}</div></div><div class="metric-cell">${fmt(w.duration)} мин</div><div class="metric-cell">${w.distance?fmt(w.distance)+' км':'—'}</div><div class="entry-actions"><button class="icon-btn" data-edit="${escape(w.id)}" aria-label="Редактировать ${escape(w.title)}">✎</button><button class="icon-btn" data-delete="${escape(w.id)}" aria-label="Удалить ${escape(w.title)}">×</button></div></div>`).join('') : empty();
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
    let streak=0,cursor=new Date();const dates=new Set(workouts.map(w=>w.date));
    while(dates.has(localDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    $('#streak').textContent=streak;
    $('#metricDuration').textContent=fmt(minutes);$('#metricCount').textContent=list.length;$('#metricDistance').textContent=fmt(list.reduce((sum,w)=>sum+w.distance,0));$('#metricActive').textContent=new Set(list.map(w=>w.date)).size;
    renderChart(list);$('#donutTotal').textContent=fmt(minutes);
    let offset=0;const segments=[];
    $('#legend').innerHTML=types.map((t,i)=>{const total=list.filter(w=>w.type===t).reduce((s,w)=>s+w.duration,0);if(!total)return '';const percent=total/minutes*100;segments.push(`${colors[i]} ${offset}% ${offset+percent}%`);offset+=percent;return `<div class="balance-row"><span><i style="background:${colors[i]}"></i>${t}</span><b>${fmt(total)} мин · ${Math.round(percent)}%</b></div>`;}).join('')||'<div class="empty">Баланс появится после<br>первой тренировки</div>';
    $('#donut').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'#eef1e8';
    $('#entries').innerHTML=rows(list.filter(w=>(!$('#filter').value||w.type===$('#filter').value)&&(!$('#search').value||w.title.toLocaleLowerCase().includes($('#search').value.toLocaleLowerCase()))));
    renderCalendar();
  }
  function renderCalendar() {
    $('#month').textContent=month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const offset=(month.getDay()+6)%7,count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    let html='';
    for(let i=0;i<offset;i++){const d=new Date(month.getFullYear(),month.getMonth(),i-offset+1);html+=`<div class="day muted-day">${d.getDate()}</div>`;}
    for(let day=1;day<=count;day++){const date=localDate(new Date(month.getFullYear(),month.getMonth(),day));const entries=workouts.filter(w=>w.date===date);html+=`<button data-day="${date}" class="day ${entries.length?'studied ':''}${date===localDate()?'current':''}" aria-label="${dateLabel(date)}, тренировок: ${entries.length}">${day}${entries.length?`<small>${fmt(entries.reduce((s,w)=>s+w.duration,0))} мин</small>`:''}</button>`;}
    for(let i=1;(offset+count+i-1)%7!==0;i++)html+=`<div class="day muted-day">${i}</div>`;
    $('#calendarGrid').innerHTML=html;$('#dayDetails').innerHTML='';
  }
  function switchView(next, push=true) {
    if(!['overview','journal','nutrition','progress','activity'].includes(next))next='overview';
    view=next;['overview','journal','nutrition','progress','activity'].forEach(id=>$('#'+id).hidden=id!==next);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    $('#heading').textContent=({overview:'Barkaloo Fit',journal:'Журнал тренировок',nutrition:'Учёт КБЖУ и вес',progress:'Статистика',activity:'Активность'})[next];
    if(push&&location.hash!==`#/${next==='overview'?'home':next}`)history.pushState({},'',`#/${next==='overview'?'home':next}`);
    if(matchMedia('(max-width:820px)').matches)closeMenu();
  }
  function openForm(id, date) {
    editing=id||null;$('#form').reset();$('#formError').textContent='';$('#formTitle').textContent=id?'Редактировать тренировку':'Новая тренировка';
    const w=workouts.find(w=>w.id===id);if(w){for(const key of ['title','type','date','duration','distance','treadmillDuration','treadmillDistance','feeling','notes'])$('#form').elements[key].value=w[key]??'';}else{$('#form').elements.date.value=date||localDate();}
    $('#form').elements.date.max=localDate();$('#modal').showModal();
  }
  $('#journalAdd').onclick=()=>openForm();$('#close').onclick=()=>$('#modal').close();
  $('#form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);const w={id:editing||crypto.randomUUID(),title:f.get('title').trim(),type:f.get('type'),date:f.get('date'),duration:Number(f.get('duration')),distance:Number(f.get('distance')||0),treadmillDuration:Number(f.get('treadmillDuration')||0),treadmillDistance:Number(f.get('treadmillDistance')||0),feeling:f.get('feeling'),notes:f.get('notes').trim()};
    if(!w.title||!validDate(w.date)||w.date>localDate()||!Number.isFinite(w.duration)||w.duration<1||w.duration>1440||!Number.isFinite(w.distance)||w.distance<0||w.distance>1000){$('#formError').textContent='Проверьте название, дату и числовые значения. Будущие тренировки пока не учитываются.';return;}
    try{FitData.workout(w);}catch(error){$('#formError').textContent=error.message;return;}
    if(persist(editing?workouts.map(old=>old.id===editing?w:old):[...workouts,w])){$('#modal').close();render();toast('Тренировка сохранена');}
  };
  document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]'),day=e.target.closest('[data-day]');if(e.target.closest('[data-add-date]'))openForm(null,e.target.closest('[data-add-date]').dataset.addDate);if(edit)openForm(edit.dataset.edit);if(del&&confirm('Удалить эту тренировку?')){if(persist(workouts.filter(w=>w.id!==del.dataset.delete))){render();toast('Тренировка удалена');}}if(day){$('#dayDetails').innerHTML=`<h3>${dateLabel(day.dataset.day)}</h3>`+rows(workouts.filter(w=>w.date===day.dataset.day))+(day.dataset.day<=localDate()?`<button class="btn day-add" data-add-date="${day.dataset.day}">Добавить в этот день</button>`:'');}});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{days=Number(b.dataset.days);document.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x.dataset.days===b.dataset.days));render();});
  $('#filter').onchange=render;$('#search').oninput=render;
  $('#prev').onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendar();};$('#next').onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendar();};
  $('#todayMonth').onclick=()=>{month=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar();};
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
      if(imports.some(i=>i.id===id)){status.textContent='Эта запись уже сохранена';status.className='status';return;}
      if(!saveState({...snapshot(),imports:[...imports,{id,receivedAt:new Date().toISOString(),payload}]}))throw Error('Не удалось сохранить запись');
      status.textContent='Исходные данные сохранены. Распознавание показателей настроим позже.';status.className='status good';$('#chatData').value='';render();
    }catch(error){status.textContent=error.message;status.className='status bad';}finally{button.disabled=false;}
  };
  window.FitApp={read(){if(storageBroken)throw Error("Локальное хранилище повреждено. Синхронизация остановлена.");return snapshot();},apply(value){if(!saveState(value,false))throw Error('Не удалось сохранить облачную версию');render();},download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  $('#exportBackup').onclick=()=>{try{const value=storageBroken?JSON.parse(localStorage.getItem(KEY)):snapshot();FitApp.download(value,'barkaloo-fit-backup.json');}catch{toast('Не удалось прочитать исходное хранилище');}};
  $('#restoreBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('Файл больше 5 МБ');const value=FitData.state(JSON.parse(await file.text()));if(!confirm('Заменить текущие фитнес-данные резервной копией?'))return;if(saveState(value)){render();toast('Резервная копия восстановлена');}}catch(error){toast('Не удалось восстановить данные: '+error.message);}finally{e.target.value='';}};
  switchView(location.hash.slice(2)==='home'?'overview':location.hash.slice(2),false);
  render();
})();
