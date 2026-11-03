const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const {chromium}=require('playwright');const {backend}=require('./supabase-fake.cjs');
async function main(){
 const root=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'application/json');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const key=fs.readFileSync(path.resolve(__dirname,'../source/cloud-ui.js'),'utf8').match(/key: '([^']+)'/)[1],api=backend(key);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 async function route(context){await context.route('https://*.supabase.co/**',async route=>{const req=route.request(),h=req.headers(),cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'};if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}const result=await api.fetch(req.url(),{method:req.method(),body:req.postData(),headers:{...h,Authorization:h.authorization}});await route.fulfill({status:result.status,headers:cors,contentType:'application/json',body:await result.text()});});}
 await route(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>typeof startLesson==='function');
 await p.evaluate(()=>{
  const data=buildBackup();data.words=Array.from({length:130},(_,i)=>({id:i+1,word:'word'+String(i).padStart(3,'0'),translation:'слово '+i,kind:'passive',correct:0,wrong:i,uses:i,productionHistory:[]}));data.settings={theme:'dark'};data.stats={vocabCorrect:0,vocabWrong:0,verbCorrect:0,verbWrong:0};data.coreProgress={};restoreBackupObject(data);setPage('trainer');
 });
 await p.locator('[data-lesson="daily"]').click();
 assert.deepEqual(await p.evaluate(()=>currentLesson().queue.map(x=>x.word)),Array.from({length:100},(_,i)=>'word'+String(i).padStart(3,'0')));
 await p.locator('#lessonCheck').click();assert.equal(await p.evaluate(()=>currentLesson().results.length),0);
 await p.locator('#lessonAnswer').fill('not-the-word');await p.locator('#lessonCheck').click();
 await p.evaluate(()=>answerLesson());assert.equal(await p.evaluate(()=>words.find(w=>w.word==='word000').uses),1);
 await p.reload();assert.equal(await p.evaluate(()=>currentLesson().results.length),1);assert.equal(await p.evaluate(()=>words.find(w=>w.word==='word000').uses),1);
 await p.evaluate(()=>setPage('trainer'));await p.locator('#lessonNext').click();await p.locator('#lessonUnknown').click();assert.equal(await p.evaluate(()=>words.find(w=>w.word==='word001').uses),2);
 // A partially answered lesson and the underlying counts must travel together.
 await p.evaluate(()=>cloudSyncClient.signIn('person@example.test','test-password'));await p.waitForFunction(()=>cloudSyncClient.phase==='synced');
 const other=await browser.newContext({viewport:{width:390,height:844}});await route(other);const b=await other.newPage();b.on('pageerror',e=>errors.push(e.message));await b.goto(origin);
 await b.evaluate(()=>cloudSyncClient.signIn('person@example.test','test-password'));await b.waitForFunction(()=>cloudSyncClient.phase==='synced');
 assert.deepEqual(await b.evaluate(()=>currentLesson()),await p.evaluate(()=>currentLesson()));assert.equal(await b.evaluate(()=>words.find(w=>w.word==='word001').uses),2);
 await b.evaluate(()=>setPage('trainer'));await b.locator('#lessonNext').click();await b.locator('#lessonAnswer').fill('word002');await b.locator('#lessonCheck').click();await b.waitForFunction(()=>cloudSyncClient.phase==='synced');
 await p.evaluate(()=>cloudSyncClient.sync());await p.waitForFunction(()=>cloudSyncClient.phase==='synced');assert.equal(await p.evaluate(()=>currentLesson().results.length),3);
 // Complete the frozen queue once; no random repeats and no dropped words.
 await p.evaluate(()=>{while(currentLesson().phase!=='complete'){const s=currentLesson();if(!s.results[s.index]){document.getElementById('lessonAnswer').value=s.queue[s.index].word;answerLesson();}advanceLessonTest();}});
 assert.equal(await p.evaluate(()=>currentLesson().results.length),100);assert.equal(await p.locator('#lessonScore').textContent(),'98 / 100 правильно · 98%');
 assert.equal(await p.evaluate(()=>words.find(w=>w.word==='word002').uses),3);
 console.log('PASS: least-used top 100, blank/unknown/wrong/correct answers, no duplicates, reload and two-device Supabase simulation');
 await other.close();await p.evaluate(()=>cloudSyncClient.signOut());
 await p.evaluate(()=>{const data=buildBackup();data.words=[{id:1,word:'worst',translation:'худший',kind:'passive',correct:0,wrong:3,uses:3},{id:2,word:'medium',translation:'средний',kind:'passive',correct:1,wrong:1,uses:2},{id:3,word:'best',translation:'лучший',kind:'passive',correct:2,wrong:0,uses:2},{id:4,word:'unseen',translation:'новый',kind:'passive',correct:0,wrong:0,uses:0},{id:5,word:'active',translation:'активный',kind:'active',correct:0,wrong:10,uses:10,productionHistory:[false]}];data.settings={theme:'dark'};restoreBackupObject(data);setPage('trainer');});
 await p.locator('[data-lesson="errors"]').click();assert.deepEqual(await p.evaluate(()=>currentLesson().queue.map(x=>x.word)),['worst','medium','best']);await p.locator('#finishLessonEarly').click();assert.equal(await p.evaluate(()=>currentLesson().results.length),0);
 console.log('PASS: mistake review uses worst accuracy, excludes untested/active, handles fewer than 100');
 await p.evaluate(()=>{const data=buildBackup();data.words=[];data.settings={theme:'dark'};data.coreProgress={};data.stats={vocabCorrect:0,vocabWrong:0,verbCorrect:0,verbWrong:0};restoreBackupObject(data);setPage('trainer');});
 await p.locator('[data-lesson="new"]').click();assert.equal(await p.evaluate(()=>currentLesson().queue.length),10);
 for(let i=0;i<10;i++){
  const examples=p.locator('#lessonExamples li');assert.ok((await examples.count())>=2);assert.ok((await p.locator('#lessonExamples mark').count())>=2);
  assert.equal(await p.evaluate(()=>words.length),0);assert.equal(await p.evaluate(()=>stats.vocabCorrect+stats.vocabWrong),0);
  await p.locator('#lessonStudyNext').click();
 }
 assert.equal(await p.evaluate(()=>currentLesson().phase),'test');
 const first=await p.evaluate(()=>currentLesson().queue[0].word);
 await p.locator('#lessonUnknown').click();assert.equal(await p.evaluate(word=>coreProgress[word].lessonUses,first),1);assert.equal(await p.evaluate(()=>words.length),0);
 await p.reload();await p.evaluate(()=>setPage('trainer'));assert.equal(await p.evaluate(()=>currentLesson().results.length),1);await p.locator('#lessonNext').click();
 for(let i=1;i<10;i++){
  const word=await p.evaluate(()=>currentLesson().queue[currentLesson().index].word);
  await p.locator('#lessonAnswer').fill(word);await p.locator('#lessonCheck').click();await p.locator('#lessonNext').click();
 }
 assert.equal(await p.locator('#lessonScore').textContent(),'9 / 10 правильно · 90%');
 assert.equal(await p.evaluate(()=>words.filter(w=>w.kind==='passive'&&w.uses===1&&w.correct===1).length),9);
 assert.equal(await p.evaluate(()=>stats.vocabCorrect),9);assert.equal(await p.evaluate(()=>stats.vocabWrong),1);
 await p.locator('[data-lesson="new"]').click();assert.equal(await p.evaluate(()=>currentLesson().queue.some(item=>words.some(w=>w.word===item.word))),false);
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'/tmp/barkaloo-lesson-study.png',animations:'disabled'});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
 console.log('PASS: ten unknown study cards, highlighted bilingual examples, no view-based counts, test, promotion with counts, reload and next lesson');
 assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
