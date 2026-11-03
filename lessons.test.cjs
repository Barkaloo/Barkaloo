const {test}=require('node:test');const assert=require('node:assert/strict');
const lessons=require('./source/lessons.js');
test('daily fixes 100 distinct passive words by usage, regardless of correctness',()=>{
 const words=Array.from({length:130},(_,i)=>({word:'word'+String(i).padStart(3,'0'),kind:'passive',uses:i,correct:i%2?0:i,wrong:i%2?i:0}));
 const untouched=JSON.stringify(words);const selected=lessons.select('daily',[...words,{word:'active',kind:'active',uses:0},{...words[0]}],[],{},()=>true);
 assert.equal(selected.length,100);assert.deepEqual(selected.map(w=>w.word),words.slice(0,100).map(w=>w.word));assert.equal(JSON.stringify(words),untouched);
});
test('mistake review ranks lifetime accuracy, excluding unknown accuracy and other levels',()=>{
 const list=[{word:'perfect',kind:'passive',correct:10,wrong:0},{word:'weak',kind:'passive',correct:1,wrong:9},{word:'unseen',kind:'passive',correct:0,wrong:0},{word:'zero',kind:'passive',correct:0,wrong:1},{word:'active',kind:'active',correct:0,wrong:99},{word:'mixed',kind:'passive',correct:5,wrong:5}];
 assert.deepEqual(lessons.select('errors',list,[],{},()=>true).map(w=>w.word),['zero','weak','mixed','perfect']);
});
test('new lesson uses at most ten unknown words with two or more examples, never known words',()=>{
 const core=Array.from({length:30},(_,rank)=>({word:'w'+rank,rank:rank+1}));
 const chosen=lessons.select('new',[{word:'W0',kind:'passive'},{word:'w1',kind:'active'}],core,{w2:{lessonUses:3}},word=>word!=='w3');
 assert.equal(chosen.length,10);assert.equal(chosen[0].word,'w4');assert.ok(!chosen.some(x=>['w0','w1','w2','w3'].includes(x.word)));
});
test('small and empty dictionaries produce honest lesson sizes',()=>{
 assert.deepEqual(lessons.select('daily',[],[],{},()=>true),[]);
 assert.equal(lessons.select('daily',[{word:'one',kind:'passive'}],[],{},()=>true).length,1);
});
test('session snapshots survive serialization without changes to source word records',()=>{
 const item={word:'bank',translation:'банк',uses:3};const s=lessons.create('new',[item],'2026-11-03');
 item.translation='мой перевод';assert.equal(s.queue[0].translation,'банк');assert.equal(s.phase,'study');assert.equal(s.results.length,0);
 assert.equal(lessons.valid(JSON.parse(JSON.stringify(s))),true);assert.equal(lessons.valid({...s,queue:[]}),false);assert.equal(lessons.valid({...s,index:100}),false);
});
test('all 1500 bundled headwords have two or three translated contextual examples with the complete target token',()=>{
 const examples=require('./source/lesson-examples.json');assert.equal(Object.keys(examples).length,1500);
 for(const [word,pairs] of Object.entries(examples)){
  assert.ok(pairs.length>=2&&pairs.length<=3,word);
  for(const [en,ru] of pairs){assert.ok(en.toLowerCase().match(/[^\W\d_]+(?:'[^\W\d_]+)?/gu).includes(word),word+': '+en);assert.match(ru,/[а-яё]/i);}
 }
});
