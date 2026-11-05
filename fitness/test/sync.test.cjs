const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CloudSync:FitCloud}=require('../cloud-sync.js');
const {CloudSync:EnglishCloud,state:englishState}=require('../../source/cloud-sync.js');
const Data=require('../data.js');
const {backend}=require('../../test/supabase-fake.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const emptyEnglish=()=>({words:[],stats:{},studyDays:{},units:{},coreBank:[],coreProgress:{},settings:{theme:'dark'}});
const workout=(id,type='Силовая')=>({id,title:id,type,date:'2026-11-04',duration:50,distance:0});
function device(t,server,English=false,value){
 const map=new Map();const store={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const local={value:value||(English?emptyEnglish():Data.empty()),online:true};
 const client=new (English?EnglishCloud:FitCloud)({url:'https://example.test',key:'public-key',storage:store,fetch:server.fetch,read:()=>clone(local.value),apply:v=>{local.value=clone(v)},online:()=>local.online});
 t.after(()=>client.dispose());return {client,local,store};
}
const login=d=>d.client.signIn('person@example.test','test-password');
test('fitness uses the existing account and retains every English field',async t=>{
 const server=backend(),eng=device(t,server,true);await login(eng);
 eng.local.value.words=[{id:'hello',word:'hello',kind:'active'}];await eng.client.sync();
 const before=clone(server.rows.get('person').state),fit=device(t,server);fit.local.value.workouts=[workout('squat')];await login(fit);
 const after=clone(server.rows.get('person').state);assert.equal(after.settings.barkalooFit.workouts[0].id,'squat');delete after.settings.barkalooFit;assert.deepEqual(after,before);
});
test('English sync preserves newer fitness data without treating it as an English edit',async t=>{
 const server=backend(),eng=device(t,server,true);await login(eng);const fit=device(t,server);await login(fit);
 fit.local.value.workouts.push(workout('gym'));await fit.client.sync();
 eng.local.value.words.push({id:'new',word:'new',kind:'passive'});await eng.client.sync();assert.equal(eng.client.phase,'synced');
 assert.equal(server.rows.get('person').state.settings.barkalooFit.workouts[0].id,'gym');assert.equal(server.rows.get('person').state.words[0].word,'new');
 await fit.client.sync();assert.equal(fit.client.phase,'synced');assert.equal('barkalooFit' in englishState(server.rows.get('person').state).settings,false);
});
test('two devices sync workouts and raw ChatGPT nutrition/weight imports',async t=>{
 const server=backend(),a=device(t,server),b=device(t,server);await login(a);await login(b);
 a.local.value.workouts.push(workout('treadmill','Беговая дорожка'));a.local.value.imports.push({id:'day1',receivedAt:new Date().toISOString(),payload:{date:'2026-11-04',weight:80,nutrition:{calories:2200}}});
 await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value,a.local.value);assert.equal(b.client.phase,'synced');
});
test('first login requires explicit choice when both local and cloud fitness data exist',async t=>{
 const server=backend(),a=device(t,server);a.local.value.workouts.push(workout('remote'));await login(a);
 const b=device(t,server);b.local.value.workouts.push(workout('local'));await login(b);assert.equal(b.client.phase,'conflict');assert.equal(b.local.value.workouts[0].id,'local');
 await b.client.sync('cloud');assert.equal(b.local.value.workouts[0].id,'remote');assert.equal(JSON.parse(b.store.getItem('barkaloo_fit_backup_v1')).state.workouts[0].id,'local');
});
test('conditional writes detect intervening English updates instead of overwriting them',async t=>{
 const server=backend(),a=device(t,server);await login(a);a.local.value.workouts.push(workout('new'));
 server.beforePatch=()=>{const row=server.rows.get('person');row.state.words.push({id:'concurrent',word:'safe'});row.updated_at='2099-01-01T00:00:00Z';};
 await a.client.sync();assert.equal(a.client.phase,'conflict');assert.equal(server.rows.get('person').state.words[0].word,'safe');assert.equal(server.rows.get('person').state.settings.barkalooFit.workouts.length,0);
 await a.client.sync('local');assert.equal(server.rows.get('person').state.words[0].word,'safe');assert.equal(server.rows.get('person').state.settings.barkalooFit.workouts.length,1);
});
test('offline changes upload on reconnect; expired tokens refresh',async t=>{
 const server=backend(),a=device(t,server);await login(a);a.local.online=false;a.local.value.workouts.push(workout('offline'));await a.client.sync();assert.equal(a.client.phase,'offline');a.local.online=true;server.rejectToken=true;await a.client.sync();assert.equal(server.refreshes,1);assert.equal(a.client.phase,'synced');
});
test('different account cannot silently receive the previous account data',async t=>{
 const server=backend(),a=device(t,server);await login(a);a.local.value.workouts.push(workout('private'));await a.client.sync();await a.client.signOut();await a.client.signIn('other@example.test','test-password');assert.equal(a.client.phase,'conflict');assert.equal(server.rows.has('other'),false);
});
test('invalid cloud fitness data does not replace local data',async t=>{
 const server=backend(),a=device(t,server);await login(a);server.rows.get('person').state.settings.barkalooFit.workouts=[{id:'broken'}];await a.client.sync();assert.equal(a.client.phase,'error');assert.deepEqual(a.local.value,Data.empty());
});
test('treadmill duration may not exceed workout duration',()=>{
 assert.throws(()=>Data.workout({...workout('invalid'),treadmillDuration:51}));assert.doesNotThrow(()=>Data.workout({...workout('valid'),treadmillDuration:20,treadmillDistance:2}));
});
test('manual marks and imported draft cards synchronize separately from workout statistics',async t=>{
 const server=backend(),a=device(t,server),b=device(t,server);await login(a);await login(b);
 a.local.value.activityDays={'2026-11-02':true};a.local.value.draftWorkouts=[{id:'draft',title:'Из ChatGPT',date:'2026-11-02',data:{exercises:['Жим']},sourceImportId:'hash'}];await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value.activityDays,a.local.value.activityDays);assert.deepEqual(b.local.value.draftWorkouts,a.local.value.draftWorkouts);assert.equal(b.local.value.workouts.length,0);
 b.local.value.activityDays={};await b.client.sync();await a.client.sync();assert.deepEqual(a.local.value.activityDays,{});assert.equal(a.local.value.draftWorkouts.length,1);
});
test('strength exercise tables with unknown time and RIR zero round-trip across devices',async t=>{
 const server=backend(),a=device(t,server),b=device(t,server);await login(a);await login(b);
 a.local.value.workouts=[{...workout('strength'),format:'strength-table-v1',duration:null,exercises:[{exercise:'Жим',sets:'3',reps:'8–10',rir:'0'}]}];await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value.workouts,a.local.value.workouts);assert.equal(b.local.value.workouts[0].duration,null);
});
test('nutrition records, morning weight, real zero calories and day deletion synchronize',async t=>{
 const server=backend(),a=device(t,server),b=device(t,server);await login(a);await login(b);a.local.value.dailyEntries={'2026-11-01':Data.dailyRecord({weight:79.4,calories:0,protein:150}),'2026-11-02':Data.dailyRecord({weight:79.2})};await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value.dailyEntries,a.local.value.dailyEntries);delete b.local.value.dailyEntries['2026-11-02'];await b.client.sync();await a.client.sync();assert.equal(a.local.value.dailyEntries['2026-11-02'],undefined);assert.equal(a.local.value.dailyEntries['2026-11-01'].fat,null);
});
test('separate home and training mark maps synchronize without copying one into the other',async t=>{
 const server=backend(),a=device(t,server),b=device(t,server);await login(a);await login(b);a.local.value.activityDays={'2026-11-01':true};await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value.trainingDays,{});b.local.value.trainingDays={'2026-11-02':true};await b.client.sync();await a.client.sync();assert.deepEqual(a.local.value.activityDays,{'2026-11-01':true});assert.deepEqual(a.local.value.trainingDays,{'2026-11-02':true});a.local.value.activityDays={};await a.client.sync();await b.client.sync();assert.deepEqual(b.local.value.activityDays,{});assert.deepEqual(b.local.value.trainingDays,{'2026-11-02':true});
});
