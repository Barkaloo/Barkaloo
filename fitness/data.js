(function(root){
  'use strict';
  const types=['Силовая','Бег','Беговая дорожка','Велосипед','Ходьба','Йога'];
  const copy=value=>JSON.parse(JSON.stringify(value));
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return Number.isFinite(+d)&&d.getFullYear()===+s.slice(0,4)&&d.getMonth()+1===+s.slice(5,7)&&d.getDate()===+s.slice(8,10);}
  function workout(w){
    if(!plain(w)||typeof w.id!=='string'||!w.id||typeof w.title!=='string'||!w.title.trim()||w.title.length>80||!types.includes(w.type)||!validDate(w.date)||!Number.isFinite(w.distance)||w.distance<0||w.distance>1000)throw Error('Некорректная запись тренировки');
    if(w.format==='strength-table-v1'){
      if(w.type!=='Силовая'||!Array.isArray(w.exercises)||!w.exercises.length||w.exercises.length>100)throw Error('Некорректная таблица упражнений');
      w.exercises.forEach(validateExercise);
      if(w.duration!==null&&(!Number.isFinite(w.duration)||w.duration<1||w.duration>1440))throw Error('Некорректная длительность');
    }else if(!Number.isFinite(w.duration)||w.duration<1||w.duration>1440)throw Error('Некорректная длительность');
    for(const k of ['notes','feeling'])if(w[k]!==undefined&&typeof w[k]!=='string')throw Error('Некорректные заметки');
    for(const k of ['treadmillDistance','treadmillDuration'])if(w[k]!==undefined&&(!Number.isFinite(w[k])||w[k]<0||w[k]>(k==='treadmillDuration'?w.duration:1000)))throw Error('Проверьте показатели дорожки');
    return copy(w);
  }
  const blankExercise=()=>({exercise:'',sets:'',reps:'',rir:''});
  function validateExercise(row){
    if(!plain(row)||!['exercise','sets','reps','rir'].every(k=>typeof row[k]==='string'&&row[k].length<=(k==='exercise'?200:64)))throw Error('Проверьте строки таблицы');
    if(row.sets!==''&&(!/^\d+$/.test(row.sets)||+row.sets<1||+row.sets>100))throw Error('Подходы: целое число от 1 до 100');
    if(!row.exercise.trim()&&(row.sets||row.reps||row.rir))throw Error('Укажите название упражнения');
  }
  function exerciseRows(raw){
    if(!plain(raw)||!Array.isArray(raw.exercises)||!raw.exercises.length)return [blankExercise()];
    return raw.exercises.slice(0,100).map(item=>{
      if(typeof item==='string')return {...blankExercise(),exercise:item.slice(0,200)};
      if(!plain(item))return blankExercise();
      const text=v=>typeof v==='string'||typeof v==='number'?String(v):'';
      const sets=item.sets??item['подходы'];
      return {exercise:text(item.exercise??item.name??item['упражнение']).slice(0,200),sets:Array.isArray(sets)?String(sets.length):text(sets),reps:text(item.reps??item['повторы'])||(Array.isArray(sets)?sets.map(s=>text(s?.reps)).join(' / ').replace(/^(\s*\/\s*)+$/,''):''),rir:text(item.rir??item.RIR)||(Array.isArray(sets)?sets.map(s=>text(s?.rir??s?.RIR)).join(' / ').replace(/^(\s*\/\s*)+$/,''):'')};
    });
  }
  function state(value){
    if(!plain(value)||!Array.isArray(value.workouts))throw Error('Некорректные фитнес-данные');
    const workouts=value.workouts.map(workout);
    if(new Set(workouts.map(w=>w.id)).size!==workouts.length)throw Error('Повторяющиеся тренировки');
    const imports=value.imports||[];
    if(!Array.isArray(imports)||!imports.every(i=>plain(i)&&typeof i.id==='string'&&typeof i.receivedAt==='string'&&plain(i.payload)))throw Error('Некорректные данные импорта');
    // Existing workout dates become initial marks once. An explicit empty map
    // remains empty, so unmarking a date isn't undone by reload or sync.
    const activityDays=value.activityDays===undefined?Object.fromEntries(workouts.map(w=>[w.date,true])):value.activityDays;
    if(!plain(activityDays)||!Object.entries(activityDays).every(([date,marked])=>validDate(date)&&marked===true))throw Error('Некорректные отметки календаря');
    const draftWorkouts=value.draftWorkouts||[];
    if(!Array.isArray(draftWorkouts)||!draftWorkouts.every(w=>plain(w)&&typeof w.id==='string'&&typeof w.title==='string'&&validDate(w.date)&&plain(w.data)&&typeof w.sourceImportId==='string'))throw Error('Некорректные карточки тренировок');
    if(new Set([...workouts,...draftWorkouts].map(w=>w.id)).size!==workouts.length+draftWorkouts.length)throw Error('Повторяющиеся карточки');
    return {workouts,imports:copy(imports),activityDays:copy(activityDays),draftWorkouts:copy(draftWorkouts),settings:plain(value.settings)?copy(value.settings):{}};
  }
  function importCards(payload,importId,today){
    const source=payload.workouts??payload.workout??payload.training??payload['тренировка'];
    if(source===undefined||source===null||source===false)return {workouts:[],draftWorkouts:[]};
    const entries=Array.isArray(source)?source:[source];
    const result={workouts:[],draftWorkouts:[]};
    entries.forEach((raw,index)=>{
      if(!plain(raw))throw Error('Тренировка должна быть JSON-объектом');
      const date=raw.date??payload.date??today;
      if(!validDate(date)||date>today)throw Error('Проверьте дату тренировки');
      const id=`chat:${importId}:${index}`,title=typeof raw.title==='string'&&raw.title.trim()?raw.title.trim().slice(0,80):'Тренировка из ChatGPT';
      if(Array.isArray(raw.exercises)&&raw.exercises.length>100)throw Error('В одной тренировке допускается до 100 упражнений');
      const candidate={...copy(raw),id,title,date,distance:raw.distance??0,sourceImportId:importId,chatData:copy(raw)};
      // An exercise table is sufficient; no duration or other sport is invented.
      if(Array.isArray(raw.exercises)&&(!raw.type||raw.type==='Силовая')){
        candidate.type='Силовая';candidate.format='strength-table-v1';candidate.duration=raw.duration??null;candidate.exercises=exerciseRows(raw);
      }
      try{result.workouts.push(workout(candidate));}
      catch{result.draftWorkouts.push({id,title,date,data:copy(raw),sourceImportId:importId});}
    });
    return result;
  }
  const empty=()=>({workouts:[],imports:[],activityDays:{},draftWorkouts:[],settings:{}});
  const api={types,validDate,workout,state,empty,importCards,blankExercise,exerciseRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitData=api;
})(globalThis);
