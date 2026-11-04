const {test}=require('node:test');const assert=require('node:assert/strict');const progress=require('./source/progress.js'),lessons=require('./source/lessons.js');
test('snapshots count unique levels and actual trainer totals only',()=>{
 assert.deepEqual(progress.snapshot([{word:'A',kind:'active'},{word:'b',kind:'passive'},{word:'A',kind:'general'}],[{word:'a'},{word:'b'},{word:'c'},{word:'c'}],{vocabCorrect:8,vocabWrong:2,verbCorrect:3,verbWrong:1}),{active:1,passive:1,unknown:1,trainerAttempts:14});
});
test('daily history never invents earlier days and overwrites only the current day',()=>{
 const history={};const v={active:2,passive:4,unknown:6,trainerAttempts:10};assert.equal(progress.record(history,'2026-11-04',v,'2026-11-04T10:00:00Z'),true);assert.equal(progress.record(history,'2026-11-04',v,'2026-11-04T11:00:00Z'),false);
 progress.record(history,'2026-11-05',{...v,active:3},'2026-11-05T10:00:00Z');assert.deepEqual(Object.keys(history),['2026-11-04','2026-11-05']);assert.equal(history['2026-11-04'].active,2);
 assert.deepEqual(progress.series(history,'active',30,'2026-11-05'),[{date:'2026-11-04',value:2},{date:'2026-11-05',value:3}]);
});
test('range filtering keeps real sparse history without filling gaps',()=>{
 const h={'2026-10-01':{active:1},'2026-11-01':{active:2},'2026-11-04':{active:3},'2026-11-08':{active:99}};
 assert.deepEqual(progress.series(h,'active',7,'2026-11-04').map(p=>p.date),['2026-11-01','2026-11-04']);assert.equal(progress.series(h,'active',0,'2026-11-04').length,3);
});
test('context ranks absolute mistakes before accuracy and includes only distinct passive words',()=>{
 const list=[{word:'most',kind:'passive',wrong:20,correct:80},{word:'least-accurate',kind:'passive',wrong:2,correct:0},{word:'active',kind:'active',wrong:100},{word:'MOST',kind:'passive',wrong:20},{word:'unseen',kind:'passive'}];
 assert.deepEqual(progress.contextWords(list).map(w=>w.word),['most','least-accurate','unseen']);assert.equal(progress.contextWords(list,1).length,1);
});
test('last used keeps the newest real date and rejects invalid calendar dates',()=>{
 assert.equal(progress.normalizeDate('2026-02-30'),null);assert.equal(progress.normalizeDate('not a date'),null);assert.equal(progress.lastUsed({word:'HELLO',lastUsedAt:'2026-11-04T10:00:00Z'},{hello:{lastUsedAt:'2026-11-01'}}),'2026-11-04T10:00:00.000Z');assert.equal(progress.lastUsed({word:'new'}),null);
});
test('Review selects the oldest 100 passive words, prioritizing unrecorded dates honestly',()=>{
 const words=[{word:'recent',kind:'passive',lastUsedAt:'2026-11-04'},{word:'old',kind:'passive',lastUsedAt:'2026-10-01'},{word:'missing',kind:'passive'},{word:'active',kind:'active',lastUsedAt:'2025-01-01'},{word:'p-date',kind:'passive'}];
 assert.deepEqual(lessons.select('review',words,[],{'p-date':{lastUsedAt:'2026-09-01'}},()=>true).map(w=>w.word),['missing','p-date','old','recent']);
 const hundred=Array.from({length:120},(_,i)=>({word:'w'+i,kind:'passive'}));assert.equal(lessons.select('review',hundred,[],{},()=>true).length,100);
 assert.equal(lessons.valid(lessons.create('review',words.slice(0,1),'2026-11-04')),true);
});
