(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'ritm.workouts.v1';
  const types = ['Силовая','Бег','Велосипед','Ходьба','Йога'];
  const colors = ['#43795a','#a3bc80','#d6b777','#7d9b9b','#c4b3ce'];
  const icons = ['↟','⌁','◎','↗','✳'];
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDate = s => new Date(s+'T12:00:00');
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(+parseDate(s)) && localDate(parseDate(s)) === s;
  const fmt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  const dateLabel = s => parseDate(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workouts = [], days = 7, editing = null, goal = 3, view = 'overview', metric = 'duration';
  let month = new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let storageBroken = false;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {workouts:[],goal:3};
    if (!Array.isArray(saved.workouts) || !saved.workouts.every(w => w && typeof w.id === 'string' && typeof w.title === 'string' && types.includes(w.type) && validDate(w.date) && Number.isFinite(w.duration) && w.duration>0 && Number.isFinite(w.distance) && w.distance>=0)) throw Error('invalid');
    workouts = saved.workouts;
    goal = Number.isInteger(saved.goal) && saved.goal>=1 && saved.goal<=14 ? saved.goal : 3;
  } catch {
    storageBroken = true;
    setTimeout(() => toast('Не удалось прочитать сохранённые данные. Экспортируйте исходные данные перед новой записью.'),100);
  }
  let toastTimer;
  function toast(message) { $('#toast').textContent = message; $('#toast').style.display='block'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').style.display='none',6000); }
  function persist(next, nextGoal = goal) {
    if(storageBroken){toast('Сохранение заблокировано: сначала экспортируйте исходные данные и очистите повреждённое хранилище в настройках браузера.');return false;}
    try {localStorage.setItem(KEY,JSON.stringify({workouts:next,goal:nextGoal}));workouts=next;goal=nextGoal;return true;}
    catch {toast('Не удалось сохранить данные. Проверьте доступное место и разрешения браузера.');return false;}
  }
  function period() {const end=new Date();end.setHours(0,0,0,0);const start=new Date(end);start.setDate(start.getDate()-days+1);return {start,end};}
  function selected() {const {start,end}=period();return workouts.filter(w=>w.date>=localDate(start)&&w.date<=localDate(end));}
  function sorted(list) {return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));}
  function empty() {return '<div class="empty"><b>Здесь начинается ваш прогресс</b>Добавьте первую тренировку — и цифры оживут.</div>';}
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
    $('#today').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    $('#range').textContent=`${dateLabel(localDate(start))} — ${dateLabel(localDate(end))}`;
    $('#count').textContent=list.length;$('#duration').innerHTML=`${fmt(minutes)} <em>мин</em>`;
    $('#distance').innerHTML=`${fmt(list.reduce((s,w)=>s+w.distance,0))} <em>км</em>`;
    $('#activeDays').textContent=new Set(list.map(w=>w.date)).size;
    $('#consistency').textContent=`из ${days} дней периода`;
    $('#average').textContent=list.length?fmt(minutes/list.length):'—';
    let streak=0,cursor=new Date();const dates=new Set(workouts.map(w=>w.date));
    while(dates.has(localDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    $('#streak').textContent=streak;
    $('#metricDuration').textContent=fmt(minutes);$('#metricCount').textContent=list.length;$('#metricDistance').textContent=fmt(list.reduce((sum,w)=>sum+w.distance,0));$('#metricActive').textContent=new Set(list.map(w=>w.date)).size;
    renderChart(list);$('#donutTotal').textContent=fmt(minutes);
    let offset=0;const segments=[];
    $('#legend').innerHTML=types.map((t,i)=>{const total=list.filter(w=>w.type===t).reduce((s,w)=>s+w.duration,0);if(!total)return '';const percent=total/minutes*100;segments.push(`${colors[i]} ${offset}% ${offset+percent}%`);offset+=percent;return `<div class="balance-row"><span><i style="background:${colors[i]}"></i>${t}</span><b>${fmt(total)} мин · ${Math.round(percent)}%</b></div>`;}).join('')||'<div class="empty">Баланс появится после<br>первой тренировки</div>';
    $('#donut').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'#eef1e8';
    $('#recent').innerHTML=rows(sorted(list).slice(0,3));
    const weekStart=new Date();weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-(weekStart.getDay()+6)%7);
    const weekly=workouts.filter(w=>w.date>=localDate(weekStart)&&w.date<=localDate()).length;
    $('#goal').value=goal;$('#goalBar').style.width=Math.min(100,weekly/goal*100)+'%';$('#goalText').textContent=`${weekly} из ${goal} тренировок на этой неделе${weekly>=goal?' · Цель достигнута!':''}`;
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
    if(!['overview','journal','progress'].includes(next))next='overview';
    view=next;['overview','journal','progress'].forEach(id=>$('#'+id).hidden=id!==next);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    $('#heading').textContent=next==='overview'?'Тренировки':next==='journal'?'Журнал тренировок':'Прогресс';
    if(push&&location.hash!==`#/${next==='overview'?'home':next}`)history.pushState({},'',`#/${next==='overview'?'home':next}`);
    if(matchMedia('(max-width:820px)').matches)closeMenu();
  }
  function openForm(id, date) {
    editing=id||null;$('#form').reset();$('#formError').textContent='';$('#formTitle').textContent=id?'Редактировать тренировку':'Новая тренировка';
    const w=workouts.find(w=>w.id===id);if(w){for(const key of ['title','type','date','duration','distance','feeling','notes'])$('#form').elements[key].value=w[key]??'';}else{$('#form').elements.date.value=date||localDate();}
    $('#form').elements.date.max=localDate();$('#modal').showModal();
  }
  $('#add').onclick=()=>openForm();$('#journalAdd').onclick=()=>openForm();$('#close').onclick=()=>$('#modal').close();
  $('#form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);const w={id:editing||crypto.randomUUID(),title:f.get('title').trim(),type:f.get('type'),date:f.get('date'),duration:Number(f.get('duration')),distance:Number(f.get('distance')||0),feeling:f.get('feeling'),notes:f.get('notes').trim()};
    if(!w.title||!validDate(w.date)||w.date>localDate()||!Number.isFinite(w.duration)||w.duration<1||w.duration>1440||!Number.isFinite(w.distance)||w.distance<0||w.distance>1000){$('#formError').textContent='Проверьте название, дату и числовые значения. Будущие тренировки пока не учитываются.';return;}
    if(persist(editing?workouts.map(old=>old.id===editing?w:old):[...workouts,w])){$('#modal').close();render();toast('Тренировка сохранена');}
  };
  document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]'),day=e.target.closest('[data-day]');if(e.target.closest('[data-add-date]'))openForm(null,e.target.closest('[data-add-date]').dataset.addDate);if(edit)openForm(edit.dataset.edit);if(del&&confirm('Удалить эту тренировку?')){if(persist(workouts.filter(w=>w.id!==del.dataset.delete))){render();toast('Тренировка удалена');}}if(day){$('#dayDetails').innerHTML=`<h3>${dateLabel(day.dataset.day)}</h3>`+rows(workouts.filter(w=>w.date===day.dataset.day))+(day.dataset.day<=localDate()?`<button class="btn day-add" data-add-date="${day.dataset.day}">Добавить в этот день</button>`:'');}});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{days=Number(b.dataset.days);document.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x.dataset.days===b.dataset.days));render();});
  $('#all').onclick=()=>switchView('journal');$('#filter').onchange=render;$('#search').oninput=render;
  $('#prev').onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendar();};$('#next').onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendar();};
  $('#goal').onchange=e=>{const value=Number(e.target.value);if(!Number.isInteger(value)||value<1||value>14){e.target.value=goal;toast('Выберите цель от 1 до 14 тренировок');return;}persist(workouts,value);render();};
  $('#export').onclick=()=>{let content;try{content=storageBroken?localStorage.getItem(KEY):JSON.stringify({version:1,exportedAt:new Date().toISOString(),goal,workouts},null,2);}catch{toast('Хранилище недоступно');return;}const blob=new Blob([content||''],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ritm-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Все тренировки экспортированы');};
  $('#demo').onclick=()=>{if(workouts.length){toast('Демоданные доступны только в пустом дневнике');return;}const sample=[['Бег в парке','Бег',35,5,0],['Сила и баланс','Силовая',55,0,1],['Вечерняя прогулка','Ходьба',40,3.2,2],['Восстановление и растяжка','Йога',30,0,3],['Велопрогулка','Велосипед',60,18,5],['Тренировка всего тела','Силовая',50,0,6],['Лёгкий бег','Бег',25,3.5,9],['Утренняя йога','Йога',25,0,12]].map(([title,type,duration,distance,ago])=>{const d=new Date();d.setDate(d.getDate()-ago);return {id:crypto.randomUUID(),title,type,duration,distance,date:localDate(d),feeling:'Хорошо',notes:'Демонстрационная тренировка'};});if(persist(sample)){render();toast('Добавлены демонстрационные тренировки. Их можно удалить в журнале.');}};
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
  $('#importBackupFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('size');const data=JSON.parse(await file.text());if(!Array.isArray(data.workouts)||!data.workouts.every(w=>w&&typeof w.id==='string'&&typeof w.title==='string'&&w.title.trim()&&w.title.length<=80&&types.includes(w.type)&&validDate(w.date)&&w.date<=localDate()&&Number.isFinite(w.duration)&&w.duration>=1&&w.duration<=1440&&Number.isFinite(w.distance)&&w.distance>=0&&w.distance<=1000&&(w.notes===undefined||typeof w.notes==='string')&&(w.feeling===undefined||typeof w.feeling==='string'))||new Set(data.workouts.map(w=>w.id)).size!==data.workouts.length)throw Error('invalid');if(!confirm('Заменить текущий журнал данными из файла? Перед восстановлением сохраните резервную копию.'))return;const newGoal=Number.isInteger(data.goal)&&data.goal>=1&&data.goal<=14?data.goal:goal;if(persist(data.workouts,newGoal)){render();toast('Резервная копия восстановлена');}}catch{toast('Не удалось восстановить файл. Нужна корректная резервная копия тренировок до 5 МБ.');}finally{e.target.value='';}};
  switchView(location.hash.slice(2)==='home'?'overview':location.hash.slice(2),false);
  render();
})();
