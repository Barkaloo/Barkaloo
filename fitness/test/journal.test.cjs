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
test('exercise names alone create a strength table without fabricated duration or set counts',()=>{
 const cards=Data.importCards({date:'2026-11-01',workout:{exercises:['Присед','Жим']}},'hash','2026-11-04');assert.equal(cards.workouts.length,1);assert.equal(cards.draftWorkouts.length,0);assert.equal(cards.workouts[0].duration,null);assert.deepEqual(cards.workouts[0].exercises,[{exercise:'Присед',sets:'',reps:'',rir:''},{exercise:'Жим',sets:'',reps:'',rir:''}]);assert.doesNotThrow(()=>Data.state({...Data.empty(),...cards}));
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

test('empty strength tables are valid dated cards and missing time stays null',()=>{
 const table={...workout,format:'strength-table-v1',duration:null,exercises:[Data.blankExercise()]};assert.deepEqual(Data.workout(table),table);assert.equal(Data.state({workouts:[table]}).workouts[0].duration,null);
});
test('strength rows preserve rep ranges and RIR zero without losing older metadata',()=>{
 const table={...workout,format:'strength-table-v1',notes:'Старые заметки',exercises:[{exercise:'Жим <тест>',sets:'3',reps:'8 / 8 / 6',rir:'0'}]};assert.deepEqual(Data.state({workouts:[table]}).workouts[0],table);
});
test('numeric sets must be whole and values cannot be attached to an unnamed exercise',()=>{
 const table={...workout,format:'strength-table-v1',duration:null,exercises:[{exercise:'Жим',sets:'2.5',reps:'8',rir:'1'}]};assert.throws(()=>Data.workout(table));table.exercises[0]={exercise:'',sets:'3',reps:'8',rir:'1'};assert.throws(()=>Data.workout(table));
});
test('per-set import retains actual reps and RIR without inventing missing entries',()=>{
 const raw={exercises:[{name:'Присед',sets:[{reps:8,rir:2},{reps:6,rir:0}]}]};const card=Data.importCards({date:'2026-11-01',workout:raw},'hash','2026-11-04').workouts[0];assert.deepEqual(card.exercises,[{exercise:'Присед',sets:'2',reps:'8 / 6',rir:'2 / 0'}]);assert.deepEqual(card.chatData,raw);
});
test('legacy shared marks are copied once; home and training calendars then stay independent',()=>{
 const old=Data.state({workouts:[],activityDays:{'2026-11-01':true}});assert.deepEqual(old.trainingDays,old.activityDays);assert.notEqual(old.trainingDays,old.activityDays);delete old.activityDays['2026-11-01'];const restored=Data.state(old);assert.deepEqual(restored.activityDays,{});assert.deepEqual(restored.trainingDays,{'2026-11-01':true});restored.trainingDays={};assert.deepEqual(Data.state(restored).trainingDays,{});
});
