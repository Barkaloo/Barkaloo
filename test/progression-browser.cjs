const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'../dist');const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=path.join(root,name==='/'?'index.html':name);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{const p=await b.newPage({viewport:{width:1280,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port);
 await p.evaluate(()=>{words=[];coreProgress={};settings={theme:'dark'};stats={vocabCorrect:0,vocabWrong:0,verbCorrect:0,verbWrong:0};saveAll();setPage('dictionary');dictKind='general';renderDictionary();});
 await p.locator('#wordInput').fill('barkalootest');await p.locator('#translationInput').fill('мой перевод; проверка');await p.locator('#addWordBtn').click();
 assert.equal(await p.evaluate(()=>coreWordState(getCoreItem('barkalootest'))),'general');
 const bankSize=await p.evaluate(()=>coreBank.length);
 await p.locator('#wordInput').fill('Barkalootest');await p.locator('#translationInput').fill('мой перевод; проверка');await p.locator('#addWordBtn').click();assert.equal(await p.evaluate(()=>coreBank.length),bankSize);
 // Four correct recognitions in free practice, then the fifth from a chat lesson.
 await p.evaluate(()=>{trainerVocabKind='general';for(let i=0;i<4;i++){currentVocab=getCoreItem('barkalootest');vocabDirection.value='toTranslation';vocabAnswer.value='проверка';vocabAnswered=false;checkVocab();}});
 assert.equal(await p.evaluate(()=>coreWordState(getCoreItem('barkalootest'))),'general');
 const importData=async data=>{await p.evaluate(async data=>{lessonData.value=JSON.stringify(data);await importLessonData();},data)};
 await importData({id:'recognition-five',words:[{word:'barkalootest',kind:'active',attempts:[{direction:'en-ru',correct:true}]}]});
 assert.equal(await p.evaluate(()=>coreWordState(getCoreItem('barkalootest'))),'passive');assert.equal(await p.evaluate(()=>coreProgress.barkalootest.recognitionCorrect),5);
 const count=await p.evaluate(()=>stats.vocabCorrect);await importData({id:'recognition-five',words:[{word:'barkalootest',attempts:[{direction:'en-ru',correct:true}]}]});assert.equal(await p.evaluate(()=>stats.vocabCorrect),count);
 await importData({id:'production-four',words:[{word:'barkalootest',attempts:[true,true,false,true].map(correct=>({direction:'ru-en',correct}))}]});assert.equal(await p.evaluate(()=>words[0].kind),'passive');
 // The fifth production is answered in the daily lesson, using the same rolling history.
 await p.evaluate(()=>{setPage('trainer');startLesson('daily');document.getElementById('lessonAnswer').value='barkalootest';answerLesson();});
 assert.equal(await p.evaluate(()=>words[0].kind),'active');assert.equal(await p.evaluate(()=>words[0].uses),5);
 await importData({id:'two-errors',words:[{word:'barkalootest',attempts:[false,false].map(correct=>({direction:'ru-en',correct}))}]});assert.equal(await p.evaluate(()=>words[0].kind),'active');
 await p.evaluate(()=>{trainerVocabKind='active';currentVocab=words[0];vocabDirection.value='toWord';vocabAnswer.value='wrong';vocabAnswered=false;checkVocab();});assert.equal(await p.evaluate(()=>words[0].kind),'passive');
 const snapshot=await p.evaluate(()=>JSON.stringify({words,coreProgress}));await p.reload();assert.equal(await p.evaluate(()=>JSON.stringify({words,coreProgress})),snapshot);assert.equal(await p.evaluate(()=>getCoreItem('barkalootest').translation),'мой перевод; проверка');assert.equal(await p.evaluate(()=>coreBank.length),bankSize);
 console.log('PASS: general additions/dedup, 5 recognition successes across free practice and chat, 4/5 promotion across chat and daily lesson, three-error demotion, reload and translations');
 // Imported level metadata cannot bypass gates; production before recognition remains general.
 await importData({id:'no-bypass',words:[{word:'gatecheck',translation:'проверка порога',kind:'active',attempts:Array.from({length:5},()=>({direction:'ru-en',correct:true}))}]});assert.equal(await p.evaluate(()=>coreWordState(getCoreItem('gatecheck'))),'general');
 await importData({id:'unordered',words:[{word:'barkalootest',correct:99,wrong:3,kind:'active'}]});assert.equal(await p.evaluate(()=>words.find(w=>w.word==='barkalootest').kind),'passive');assert.equal(await p.evaluate(()=>BarkalooProgression.history(words[0]).length),0);
 // A malformed attempt makes the whole import fail before any changes are applied.
 const before=await p.evaluate(()=>JSON.stringify(buildBackup().words));await importData({id:'invalid',words:[{word:'barkalootest',attempts:[{direction:'ru-en',correct:true}]},{word:'other',attempts:[{direction:'sideways',correct:false}]}]});assert.equal(await p.evaluate(()=>JSON.stringify(buildBackup().words)),before);
 console.log('PASS: no kind/aggregate bypass, no fabricated history, duplicate import protection and atomic validation');
 assert.deepEqual(errors,[]);
 }finally{await b.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
