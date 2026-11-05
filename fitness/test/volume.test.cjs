const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../data.js'),V=require('../volume.js');
const workout=(id,date,exercises)=>D.workout({id,date,type:'Силовая',format:'strength-table-v1',title:'Тренировка',duration:null,distance:0,exercises:exercises.map(([exercise,sets])=>({exercise,sets:String(sets),reps:'8–10',rir:'0'}))});
test('the five supplied exercises and spelling variants resolve without guessing ambiguous rows',()=>{
 const s=D.empty();assert.equal(V.resolve(' ЖИМ ЛЁЖА ',s).key,'bench');assert.equal(V.resolve('румынка',s).key,'rdl');assert.equal(V.resolve('тяга вертикально блока',s).key,'latPulldown');assert.equal(V.resolve('горизонтальная тяга в хаммере',s).key,'hammerRow');assert.equal(V.resolve('тяга блока',s).mapped,false);
});
test('volume counts recorded sets once overall and separately for all direct and indirect muscles',()=>{
 const s=D.empty();s.workouts=[workout('a','2026-11-05',[['жим лежа',3],['жим ногами',4],['румынка',3],['горизонтальная тяга в хаммере',3],['тяга вертикально блока',3]])];const v=V.summary(s,'2026-11-01','2026-11-07'),g=Object.fromEntries(v.groups.map(g=>[g.key,g]));assert.equal(v.totalSets,16);assert.equal(v.countedSets,16);assert.equal(g.chest.primary,3);assert.equal(g.glutes.primary,7);assert.equal(g.back.primary,6);assert.equal(g.biceps.secondary,6);assert.equal(g.triceps.secondary,3);assert.equal(g.erectors.secondary,3);assert.equal(g.biceps.primary,0);assert.deepEqual(s.trainingDays,{});
});
test('unknown exercises and missing counts remain visible without inventing sets',()=>{
 const s=D.empty();s.workouts=[workout('a','2026-11-05',[['Неизвестное',4],['Жим лёжа','']])];const v=V.summary(s,'2026-11-01','2026-11-07');assert.equal(v.totalSets,4);assert.equal(v.countedSets,0);assert.equal(v.unknown[0].sets,4);assert.equal(v.missingSets,1);
});
test('weeks begin on Monday, respect date boundaries and preserve individual exercise sources',()=>{
 const s=D.empty();s.workouts=[workout('before','2026-10-31',[['жим лежа',5]]),workout('a','2026-11-01',[['жим лежа',2]]),workout('b','2026-11-02',[['жим лежа',3]]),workout('after','2026-11-05',[['жим лежа',9]])];const v=V.summary(s,'2026-11-01','2026-11-03');assert.equal(v.totalSets,5);assert.deepEqual(v.weeks.map(w=>[w.from,w.to,w.groups.chest.primary]),[['2026-11-01','2026-11-01',2],['2026-11-02','2026-11-03',3]]);assert.equal(v.groups[0].contributions.length,2);assert.throws(()=>V.summary(s,'2026-11-03','2026-11-01'));
});
test('custom assignments change historical counts without rewriting workouts or other settings',()=>{
 const s=D.empty();s.workouts=[workout('a','2026-11-05',[['Жим лёжа',3],['Моё упражнение',2]])];s.settings={theme:'dark',exerciseMuscles:{bench:D.exerciseMapping({label:'Жим лёжа',primary:['chest','triceps'],secondary:['frontDelts']}),'custom:мое упражнение':D.exerciseMapping({label:'Моё упражнение',primary:['forearms'],secondary:[]})}};const before=JSON.stringify(s.workouts),normalized=D.state(s),v=V.summary(normalized,'2026-11-01','2026-11-07');assert.equal(v.countedSets,5);assert.equal(v.groups.find(g=>g.key==='triceps').primary,3);assert.equal(v.groups.find(g=>g.key==='forearms').primary,2);assert.equal(normalized.settings.theme,'dark');assert.equal(JSON.stringify(s.workouts),before);assert.equal(V.catalogue(s).filter(v=>v.key==='bench').length,1);
});
test('invalid assignment cannot corrupt local or cloud state',()=>{
 for(const mapping of [{label:'x',primary:[],secondary:[]},{label:'x',primary:['chest'],secondary:['chest']},{label:'x',primary:['fake'],secondary:[]},{label:'x',primary:['chest','chest'],secondary:[]}])assert.throws(()=>D.state({...D.empty(),settings:{exerciseMuscles:{test:mapping}}}));
});
test('activity checkboxes and cardio never create muscle volume; draft tables use only actual counts',()=>{
 const s=D.empty();s.extraActivity={'2026-11-05':D.activityRecord({forearms:true,posture:true})};s.draftWorkouts=[{id:'draft',date:'2026-11-05',data:{exercises:[{exercise:'Жим лёжа',sets:3},{exercise:'Румынка',sets:'?'}]}}];const v=V.summary(s,'2026-11-01','2026-11-07');assert.equal(v.totalSets,3);assert.equal(v.missingSets,1);assert.equal(v.groups.find(g=>g.key==='forearms').primary,0);
});
