const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'../dist');let documents=0;
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.join(root,name==='/'?'index.html':name);if(!fs.existsSync(file)){res.writeHead(404).end();return;}if(file.endsWith('.html'))documents++;res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'application/json');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);
 assert.equal(await p.locator('#home .card h3').first().textContent(),'Bank');assert.equal(await p.locator('#coreSearch').getAttribute('placeholder'),'Search');
 assert.equal(await p.locator('#brandHome img').evaluate(img=>img.complete&&img.naturalWidth>0&&img.dataset.offline.startsWith('data:image/png;base64,')),true);
 await p.evaluate(()=>{window.navigationMarker=42;});
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const loads=documents;
 await p.locator('.nav-btn[data-page="dictionary"]').click();await p.locator('.nav-btn[data-page="grammar"]').click();await p.locator('.nav-btn[data-page="trainer"]').click();
 await p.goBack();await p.waitForFunction(()=>document.querySelector('.section.active').id==='grammar');
 await p.goBack();await p.waitForFunction(()=>document.querySelector('.section.active').id==='dictionary');
 await p.goForward();await p.waitForFunction(()=>document.querySelector('.section.active').id==='grammar');assert.equal(documents,loads);assert.equal(await p.evaluate(()=>navigationMarker),42);
 await p.locator('#brandHome img').click();assert.equal(await p.locator('#home').isVisible(),true);await p.goBack();await p.waitForFunction(()=>document.querySelector('.section.active').id==='grammar');await p.locator('#brandHome .logo-title').click();assert.equal(await p.locator('#home').isVisible(),true);
 // Native extra mouse buttons use Chromium's normal history navigation.
 await p.locator('.nav-btn[data-page="dictionary"]').click();await p.locator('.nav-btn[data-page="trainer"]').click();const mouse=await p.context().newCDPSession(p);await mouse.send('Input.dispatchMouseEvent',{type:'mousePressed',x:1100,y:60,button:'back',buttons:8,clickCount:1});await mouse.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1100,y:60,button:'back',buttons:0,clickCount:1});await p.waitForFunction(()=>document.querySelector('.section.active').id==='dictionary');await mouse.send('Input.dispatchMouseEvent',{type:'mousePressed',x:1100,y:60,button:'forward',buttons:16,clickCount:1});await mouse.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1100,y:60,button:'forward',buttons:0,clickCount:1});await p.waitForFunction(()=>document.querySelector('.section.active').id==='trainer');assert.equal(documents,loads);
 await p.reload();await p.waitForFunction(()=>document.querySelector('.section.active').id==='trainer');assert.match(p.url(),/#\/trainer$/);
 console.log('PASS: Bank/Search labels, embedded character logo, both home-link targets, browser/extra-mouse back-forward without reload and deep-route reload');
 await p.evaluate(()=>{setPage('home');stats={vocabCorrect:2,vocabWrong:1,verbCorrect:3,verbWrong:2};saveAll();});const before=await p.evaluate(()=>JSON.stringify(stats));
 const importData=async data=>p.evaluate(async data=>{lessonData.value=JSON.stringify(data);await importLessonData();},data);
 await importData({id:'chat-ordered-counter-test',words:[{word:'chatcountertest',translation:'мой перевод',attempts:[...Array.from({length:5},()=>({direction:'en-ru',correct:true})),...[true,true,false,true,true].map(correct=>({direction:'ru-en',correct}))]}],trainer:{vocabCorrect:999,vocabWrong:999,verbCorrect:999,verbWrong:999}});
 assert.equal(await p.evaluate(()=>JSON.stringify(stats)),before);assert.deepEqual(await p.evaluate(()=>{const w=words.find(x=>x.word==='chatcountertest');return {kind:w.kind,uses:w.uses,correct:w.correct,wrong:w.wrong,recognition:coreProgress.chatcountertest.recognitionCorrect}}),{kind:'active',uses:5,correct:4,wrong:1,recognition:5});
 await importData({id:'chat-aggregate-counter-test',words:[{word:'chatcountertest',correct:6,wrong:1},{word:'chatrecognitiontest',direction:'en-ru',correct:5,wrong:2},{word:'chatmixedtest',recognitionCorrect:3,recognitionWrong:1}],trainer:{vocabCorrect:40,verbWrong:20}});assert.equal(await p.evaluate(()=>JSON.stringify(stats)),before);assert.equal(await p.evaluate(()=>words.find(w=>w.word==='chatcountertest').uses),12);assert.equal(await p.evaluate(()=>coreWordState(getCoreItem('chatrecognitiontest'))),'passive');
 await importData({id:'chat-only-totals',words:[],trainer:{vocabCorrect:20,vocabWrong:5,verbCorrect:10,verbWrong:4}});assert.equal(await p.evaluate(()=>JSON.stringify(stats)),before);
 await p.evaluate(()=>{currentVocab=words.find(w=>w.word==='chatcountertest');trainerVocabKind='active';vocabDirection.value='toWord';vocabAnswer.value='chatcountertest';vocabAnswered=false;checkVocab();});assert.equal(await p.evaluate(()=>stats.vocabCorrect),3);assert.equal(await p.evaluate(()=>stats.vocabWrong),1);
 const expected=await p.evaluate(()=>JSON.stringify(stats));await p.reload();assert.equal(await p.evaluate(()=>JSON.stringify(stats)),expected);assert.equal(await p.evaluate(()=>words.find(w=>w.word==='chatcountertest').uses),13);
 console.log('PASS: ordered/aggregate/recognition/global chat imports update dictionary and levels without changing any trainer counter; real answers still count; reload preserves both');
 await p.evaluate(()=>{settings.theme='dark';saveSettings();setPage('dictionary');});await p.screenshot({path:'/tmp/barkaloo-brand-desktop.png',animations:'disabled'});
 await p.setViewportSize({width:390,height:844});await p.locator('#burger').click();await p.screenshot({path:'/tmp/barkaloo-brand-mobile.png',animations:'disabled'});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);await p.locator('#brandHome').click();assert.equal(await p.locator('#home').isVisible(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
