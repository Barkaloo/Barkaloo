(function(root){
 'use strict';
 const D=typeof module!=='undefined'&&module.exports?require('./data.js'):root.FitData;
 const I=typeof module!=='undefined'&&module.exports?require('./insights.js'):root.FitInsights;
 const normalize=name=>name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const defaults=[
  {key:'bench',label:'Жим лёжа',primary:['chest'],secondary:['triceps','frontDelts'],aliases:['жим лежа','жим штанги лежа','жим лежа со штангой','bench press']},
  {key:'legPress',label:'Жим ногами',primary:['quads','glutes'],secondary:[],aliases:['жим ногами в тренажере','leg press']},
  {key:'rdl',label:'Румынская тяга',primary:['hamstrings','glutes'],secondary:['erectors'],aliases:['румынка','румынская становая тяга','румынская тяга со штангой','румынская тяга с гантелями','romanian deadlift','rdl']},
  {key:'hammerRow',label:'Горизонтальная тяга в хаммере',primary:['back'],secondary:['biceps','rearDelts'],aliases:['горизонтальная тяга хаммер','горизонтальная тяга в хамере','тяга в хаммере','тяга хаммера','hammer row']},
  {key:'latPulldown',label:'Тяга вертикального блока',primary:['back'],secondary:['biceps'],aliases:['тяга вертикально блока','тяга верхнего блока','тяга вертикального блока к груди','тяга верхнего блока к груди','вертикальная тяга','вертикальный блок','lat pulldown']}
 ];
 const names=new Map();for(const entry of defaults)for(const name of [entry.label,...entry.aliases])names.set(normalize(name),entry);
 function resolve(name,state){
  const standard=names.get(normalize(name)),key=standard?.key||'custom:'+normalize(name),overrides=state.settings.exerciseMuscles||{};
  const mapping=Object.hasOwn(overrides,key)?overrides[key]:standard;
  return {key,label:mapping?.label||name.trim(),primary:mapping?.primary||[],secondary:mapping?.secondary||[],mapped:!!mapping,customized:Object.hasOwn(overrides,key)};
 }
 function sessions(state){
  return [...state.workouts.filter(w=>w.type==='Силовая'),...state.draftWorkouts.filter(w=>!w.data.type||w.data.type==='Силовая')];
 }
 function rows(workout){
  return workout.format==='strength-table-v1'?workout.exercises:D.exerciseRows(workout.chatData||workout.data||workout);
 }
 function records(state){
  const result=[];
  for(const workout of sessions(state))rows(workout).forEach((row,index)=>{
   if(!row.exercise.trim())return;
   const value=typeof row.sets==='number'?String(row.sets):row.sets;
   const sets=typeof value==='string'&&/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=100?Number(value):null;
   result.push({date:workout.date,workoutId:workout.id,row:index,exercise:row.exercise,sets,...resolve(row.exercise,state)});
  });
  return result;
 }
 function catalogue(state){
  const result=new Map(defaults.map(entry=>[entry.key,resolve(entry.label,state)]));
  for(const [key,mapping] of Object.entries(state.settings.exerciseMuscles||{}))if(!result.has(key))result.set(key,{key,...mapping,mapped:true,customized:true});
  for(const record of records(state))if(!result.has(record.key))result.set(record.key,{key:record.key,label:record.label,primary:record.primary,secondary:record.secondary,mapped:record.mapped,customized:record.customized});
  return [...result.values()];
 }
 function monday(key){const d=I.date(key);d.setDate(d.getDate()-(d.getDay()+6)%7);return I.dateKey(d);}
 function offset(key,days){const d=I.date(key);d.setDate(d.getDate()+days);return I.dateKey(d);}
 function summary(state,from,to){
  if(!D.validDate(from)||!D.validDate(to)||from>to)throw Error('Проверьте период тренировочного объёма');
  const selected=records(state).filter(row=>row.date>=from&&row.date<=to),workouts=sessions(state).filter(w=>w.date>=from&&w.date<=to);
  const groups=Object.fromEntries(Object.entries(D.muscleGroups).map(([key,label])=>[key,{key,label,primary:0,secondary:0,contributions:[]}]));
  const unknown=new Map(),weeks=new Map();let totalSets=0,countedSets=0,missingSets=0;
  for(const workout of workouts){const week=monday(workout.date);if(!weeks.has(week))weeks.set(week,{from:week<from?from:week,to:offset(week,6)>to?to:offset(week,6),groups:Object.fromEntries(Object.keys(groups).map(key=>[key,{primary:0,secondary:0}]))});}
  for(const row of selected){
   if(row.sets===null)missingSets++;else totalSets+=row.sets;
   if(!row.mapped){
    if(!unknown.has(row.key))unknown.set(row.key,{key:row.key,label:row.label,sets:0,rows:0});
    const entry=unknown.get(row.key);entry.sets+=row.sets??0;entry.rows++;continue;
   }
   if(row.sets===null)continue;
   countedSets+=row.sets;
   for(const role of ['primary','secondary'])for(const key of row[role]){
    groups[key][role]+=row.sets;groups[key].contributions.push({date:row.date,workoutId:row.workoutId,exercise:row.exercise,sets:row.sets,role});
    weeks.get(monday(row.date)).groups[key][role]+=row.sets;
   }
  }
  for(const group of Object.values(groups))group.contributions.sort((a,b)=>b.date.localeCompare(a.date));
  return {groups:Object.values(groups),weeks:[...weeks.values()].sort((a,b)=>a.from.localeCompare(b.from)),unknown:[...unknown.values()],totalSets,countedSets,missingSets,workoutCount:workouts.length,exerciseCount:new Set(selected.map(row=>row.key)).size};
 }
 const api={defaults,normalize,resolve,records,catalogue,monday,offset,summary};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitVolume=api;
})(globalThis);
