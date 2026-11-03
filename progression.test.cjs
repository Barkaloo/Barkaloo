const {test}=require('node:test');const assert=require('node:assert/strict');const rules=require('./source/progression.js');
test('passive promotion requires a real window of five with four correct',()=>{
 const w={kind:'passive',correct:50,wrong:3,uses:53,productionHistory:[]};assert.equal(rules.evaluate(w),null);
 for(const ok of [true,true,false,true])rules.production(w,ok);assert.equal(w.kind,'passive');rules.production(w,true);assert.equal(w.kind,'active');assert.equal(w.uses,58);
});
test('three consecutive wrong answers demote before ten answers are available',()=>{
 const w={kind:'active',productionHistory:[true,true,true,true,true]};rules.production(w,false);rules.production(w,false);assert.equal(w.kind,'active');rules.production(w,false);assert.equal(w.kind,'passive');
});
test('70% stays active; 60% demotes, with no run of three errors',()=>{
 const w={kind:'active',productionHistory:[true,false,true,true,false,true,true,false,true,true]};assert.equal(rules.evaluate(w),null);
 w.productionHistory=[true,false,true,false,true,false,true,false,true,true];assert.equal(rules.evaluate(w),'passive');
});
test('general production never bypasses recognition threshold',()=>{const w={kind:'general'};for(let i=0;i<8;i++)rules.production(w,true);assert.equal(w.kind,'general');assert.equal(w.correct,8)});
test('unordered lesson totals never fabricate a recent window and retain old history',()=>{
 const w={kind:'active',correct:5,wrong:0,uses:5,productionHistory:[true,true,true,true,true]};rules.aggregate(w,0,3);assert.equal(w.kind,'active');assert.equal(w.productionHistory.length,5);assert.deepEqual(rules.history(w),[]);
 for(let i=0;i<3;i++)rules.production(w,false);assert.equal(w.kind,'passive');assert.equal(w.uses,11);assert.equal(w.wrong,6);
});
test('the latest five, rather than lifetime accuracy, govern promotion',()=>{
 const w={kind:'passive',correct:100,wrong:100,uses:200,productionHistory:[false,false,false,false,true,true,true,false]};rules.production(w,true);assert.equal(w.kind,'active');
});
