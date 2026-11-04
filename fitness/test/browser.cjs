const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {backend}=require('../../test/supabase-fake.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..');const key=fs.readFileSync(path.join(root,'fitness/cloud-ui.js'),'utf8').match(/key: "([^"]+)"/)[1];const api=backend(key);
 const english={words:[{id:'hello',word:'hello',kind:'active'}],stats:{vocabCorrect:10},units:{1:true},studyDays:{'2026-11-01':true},coreProgress:{},coreBank:[],settings:{theme:'dark'}};
 api.rows.set('person',{user_id:'person',state:structuredClone(english),updated_at:new Date().toISOString()});
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;let file=path.join(root,name);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end();return;}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
  const desktop=await browser.newContext({viewport:{width:1440,height:1100}});const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  for(const context of [desktop,mobile])await context.route('https://*.supabase.co/**',async route=>{const r=route.request(),headers=r.headers();const result=await api.fetch(r.url(),{method:r.method(),body:r.postData(),headers:{...headers,Authorization:headers.authorization}});await route.fulfill({status:result.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:await result.text()});});
  // Exact supplied URLs are intercepted with explicit test images here;
  // this verifies image wiring, not live Pinterest delivery.
  for(const context of [desktop,mobile])await context.route('https://i.pinimg.com/**',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'source/logo-character.png'))}));
  const p=await desktop.newPage(),m=await mobile.newPage();for(const page of [p,m])page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/fitness/`;await p.goto(url);await m.goto(url);
  assert.equal(await p.title(),'Barkaloo Fit');assert.equal(await p.locator('.header-icon').count(),0);assert.equal(await p.locator('#heading').textContent(),'Спорт');assert.equal(await p.locator('.nav-btn').count(),5);assert.equal(await p.locator('footer').count(),0);assert.equal(await p.locator('.logo-sub').count(),0);assert.deepEqual(await p.locator('#overview .stats-grid h3').allTextContents(),['Тренировки','Время тренировок','Средняя тренировка','Дистанция','Время на дорожке','Серия активности']);
  assert.equal(await p.locator('#goal,#recent,#demo,#export').count(),0);
  const today=await p.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  const currentMonth=today.slice(0,7),previousMonth=await p.evaluate(()=>{const d=new Date();d.setMonth(d.getMonth()-1,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
  const day=p.locator(`#calendarGrid [data-mark-day="${today}"]`);
  await day.click();assert.equal(await p.locator('#dayDetails').count(),0);assert.equal(await p.evaluate(()=>Object.keys(FitApp.read().activityDays).length),0);
  await day.dblclick();assert.equal(await day.getAttribute('aria-pressed'),'true');assert.equal(await day.evaluate(el=>getComputedStyle(el,'::after').display),'block');
  await p.locator('[data-view=journal]').click();assert.equal(await p.locator(`#journalCalendarGrid [data-mark-day="${today}"]`).getAttribute('aria-pressed'),'true');
  const homeHeight=await p.locator('#calendarGrid').evaluate(el=>{const section=document.getElementById('overview');section.hidden=false;const height=el.getBoundingClientRect().height;section.hidden=true;return height;});assert((await p.locator('#journalCalendarGrid').boundingBox()).height<homeHeight);
  await p.locator(`#journalCalendarGrid [data-mark-day="${today}"]`).dblclick();await p.reload();assert.equal(await p.locator(`#journalCalendarGrid [data-mark-day="${today}"]`).getAttribute('aria-pressed'),'false');
  await p.locator('[data-view=overview]').click();assert.equal(await day.getAttribute('aria-pressed'),'false');
  await p.locator('#importToggle').click();await p.locator('#chatData').fill('{broken');await p.locator('#saveChatData').click();assert.match(await p.locator('#importStatus').textContent(),/JSON/);
  const payload={date:'2026-11-04',weight:80,nutrition:{calories:2200,protein:150,fat:70,carbs:240},notes:'<script>alert(1)</script>'};await p.locator('#chatData').fill(JSON.stringify(payload));await p.locator('#saveChatData').click();assert.match(await p.locator('#importStatus').textContent(),/сохранены/);await p.locator('#chatData').fill(JSON.stringify(payload));await p.locator('#saveChatData').click();assert.match(await p.locator('#importStatus').textContent(),/уже сохранена/);
  await p.locator('[data-view=journal]').click();
  async function add(title,type,duration,distance){await p.locator('#journalAdd').click();await p.locator('[name=title]').fill(title);await p.locator('[name=type]').selectOption(type);await p.locator('[name=duration]').fill(String(duration));await p.locator('[name=distance]').fill(String(distance));await p.getByRole('button',{name:'Сохранить тренировку'}).click();}
  await add('Тестовая дорожка','Беговая дорожка',30,4.5);await add('Бег на улице','Бег',50,8);await p.locator('[data-view=overview]').click();assert.match(await p.locator('#distance').textContent(),/4,5/);assert.match(await p.locator('#treadmillTime').textContent(),/30/);assert.equal(await p.locator('#count').textContent(),'2');assert.equal(await p.locator('#average').textContent(),'40');
  await p.locator('[data-view=journal]').click();assert.equal(await p.locator('#entries .workout-card').count(),2);
  await p.locator('#journalMonthSelect').fill(previousMonth);await p.locator('#journalMonthSelect').dispatchEvent('change');assert.equal(await p.locator('#entries .workout-card').count(),0);
  await add('Предыдущий месяц','Силовая',60,0);assert.equal(await p.locator('#entries .workout-card').count(),1);
  await p.locator('#journalMonthSelect').fill(currentMonth);await p.locator('#journalMonthSelect').dispatchEvent('change');assert.equal(await p.locator('#entries .workout-card').count(),2);
  await p.locator('#search').fill('Тестовая');assert.equal(await p.locator('#entries .workout-card').count(),1);await p.locator('#search').fill('');
  await p.locator('[data-view=overview]').click();
  const incomplete={date:today,workout:{title:'Программа из ChatGPT',exercises:['Жим','Присед']}};
  await p.locator('#chatData').fill(JSON.stringify(incomplete));await p.locator('#saveChatData').click();assert.equal(await p.evaluate(()=>FitApp.read().draftWorkouts.length),1);assert.equal(await p.locator('#count').textContent(),'3');
  await p.locator('#chatData').fill(JSON.stringify(incomplete));await p.locator('#saveChatData').click();assert.equal(await p.evaluate(()=>FitApp.read().draftWorkouts.length),1);
  const complete={date:previousMonth+'-02',workout:{title:'Тренировка из импорта',type:'Силовая',duration:35}};
  await p.locator('#chatData').fill(JSON.stringify(complete));await p.locator('#saveChatData').click();assert.equal(await p.locator('#count').textContent(),'4');
  await p.locator('[data-view=journal]').click();assert.equal(await p.locator('#entries .workout-card').count(),3);await p.locator('#entries .workout-card').filter({hasText:'Программа из ChatGPT'}).getByRole('button',{name:'Заполнить карточку',exact:true}).click();await p.locator('[name=duration]').fill('40');await p.getByRole('button',{name:'Сохранить тренировку'}).click();assert.equal(await p.evaluate(()=>FitApp.read().draftWorkouts.length),0);
  await p.locator('#journalMonthSelect').fill(previousMonth);await p.locator('#journalMonthSelect').dispatchEvent('change');assert.equal(await p.locator('#entries .workout-card').count(),2);await p.locator('#themeSelect').selectOption('dark');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/barkaloo-fit-journal-desktop.png',fullPage:true});
  await p.locator('[data-view=overview]').click();
  // A record can stay in the journal while its manual calendar mark is removed.
  if(await day.getAttribute('aria-pressed')==='true')await day.dblclick();assert.equal(await p.locator('#count').textContent(),'5');
  async function login(page){await page.locator('#cloudEmail').fill('person@example.test');await page.locator('#cloudPassword').fill('test-password');await page.locator('#cloudSignIn').click();await page.waitForFunction(()=>fitCloud.phase==='synced');}
  await login(p);await login(m);assert.equal(await m.locator('#count').textContent(),'5');assert.equal(await m.evaluate(()=>FitApp.read().imports.length),3);assert.equal(await m.locator(`#calendarGrid [data-mark-day="${today}"]`).getAttribute('aria-pressed'),'false');
  const saved=structuredClone(api.rows.get('person').state);delete saved.settings.barkalooFit;assert.deepEqual(saved,english);
  await p.reload();await p.waitForFunction(()=>fitCloud.phase==='synced');assert.equal(await p.locator('#count').textContent(),'5');assert.equal(await day.getAttribute('aria-pressed'),'false');
  const touchDay=m.locator(`#calendarGrid [data-mark-day="${today}"]`);await touchDay.tap();await touchDay.tap();assert.equal(await touchDay.getAttribute('aria-pressed'),'true');await m.evaluate(()=>fitCloud.sync());await p.evaluate(()=>fitCloud.sync());assert.equal(await day.getAttribute('aria-pressed'),'true');
  await p.locator('#themeSelect').selectOption('dark');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/barkaloo-fit-v3-desktop.png',fullPage:true});await m.locator('#themeSelect').selectOption('dark');await m.waitForTimeout(300);assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.screenshot({path:'/tmp/barkaloo-fit-v3-mobile.png',fullPage:true});
  await m.locator('#burger').click();await m.locator('[data-view=journal]').click();assert.equal(await m.locator('.header-icon').count(),0);await m.waitForTimeout(300);assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.screenshot({path:'/tmp/barkaloo-fit-journal-mobile.png',fullPage:true});await m.locator('#burger').click();await m.locator('[data-view=nutrition]').click();assert(await m.locator('#nutrition').isVisible());assert.equal(await m.locator('#overlay').isVisible(),false);await m.locator('#burger').click();await m.locator('[data-view=activity]').click();assert(await m.locator('#activity').isVisible());
  await p.locator('#cloudSignOut').click();assert(await p.locator('#cloudAuthForm').isVisible());assert.equal(await p.locator('#count').textContent(),'5');assert.deepEqual(errors,[]);
  console.log('PASS: titles without icons; single-click has no details; desktop double-click and touch double-tap; shared marks persist/sync; compact calendar; month-filtered manual/imported cards and draft completion; existing account and English preservation; mobile layout. Simulated backend/artwork.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
