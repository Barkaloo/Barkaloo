const {test}=require('node:test');const assert=require('node:assert/strict');const Data=require('../data.js');
const workout={id:'old',title:'Силовая',type:'Силовая',date:'2026-11-01',duration:60,distance:0};
test('old workout dates become initial marks, but an explicit unmark survives normalization',()=>{
 const migrated=Data.state({workouts:[workout]});assert.deepEqual(migrated.activityDays,{'2026-11-01':true});
 migrated.activityDays={};assert.deepEqual(Data.state(migrated).activityDays,{});assert.equal(Data.state(migrated).workouts.length,1);
});
test('invalid calendar marks are rejected before applying cloud state',()=>{
 assert.throws(()=>Data.state({workouts:[],activityDays:{'2026-02-30':true}}));assert.throws(()=>Data.state({workouts:[],activityDays:{'2026-11-01':'yes'}}));
});
test('ChatGPT workout creates a full card with stable identity and preserves extra fields',()=>{
 const payload={date:'2026-11-01',workout:{title:'Жим',type:'Силовая',duration:60,exercises:[{name:'Жим',sets:[{reps:8,weight:60}]}]}};
 const a=Data.importCards(payload,'hash','2026-11-04'),b=Data.importCards(payload,'hash','2026-11-04');assert.deepEqual(a,b);assert.equal(a.workouts.length,1);assert.equal(a.draftWorkouts.length,0);assert.equal(a.workouts[0].distance,0);assert.deepEqual(a.workouts[0].chatData,payload.workout);
});
test('an incomplete workout becomes a draft without invented duration, type or totals',()=>{
 const cards=Data.importCards({date:'2026-11-01',workout:{exercises:['Присед','Жим']}},'hash','2026-11-04');assert.equal(cards.workouts.length,0);assert.equal(cards.draftWorkouts.length,1);assert.equal(cards.draftWorkouts[0].duration,undefined);assert.doesNotThrow(()=>Data.state({...Data.empty(),...cards}));
});
test('nutrition-only imports do not create workout cards',()=>{
 assert.deepEqual(Data.importCards({date:'2026-11-01',weight:80,nutrition:{calories:2000}},'hash','2026-11-04'),{workouts:[],draftWorkouts:[]});
});
test('multiple workouts keep their own dates and cannot produce duplicate cards',()=>{
 const cards=Data.importCards({date:'2026-11-01',workouts:[{...workout,id:'ignored'},{...workout,date:'2026-10-31'}]},'hash','2026-11-04');assert.equal(cards.workouts.length,2);assert.equal(new Set(cards.workouts.map(w=>w.id)).size,2);assert.equal(cards.workouts[1].date,'2026-10-31');
});
test('invalid or future import dates reject the complete import',()=>{
 assert.throws(()=>Data.importCards({date:'2026-11-05',workout:{title:'x'}},'hash','2026-11-04'));assert.throws(()=>Data.importCards({date:'wrong',workout:{title:'x'}},'hash','2026-11-04'));
 assert.throws(()=>Data.importCards({date:'2026-11-01',workouts:[{...workout},{...workout,date:'2026-11-05'}]},'hash','2026-11-04'));
});
