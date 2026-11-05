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
    // Previously both calendars shared one map. Copy it once, then preserve
    // independent maps, including an explicit empty training calendar.
    const trainingDays=value.trainingDays===undefined?activityDays:value.trainingDays;
    if(!plain(trainingDays)||!Object.entries(trainingDays).every(([date,marked])=>validDate(date)&&marked===true))throw Error('Некорректные отметки журнала тренировок');
    const draftWorkouts=value.draftWorkouts||[];
    if(!Array.isArray(draftWorkouts)||!draftWorkouts.every(w=>plain(w)&&typeof w.id==='string'&&typeof w.title==='string'&&validDate(w.date)&&plain(w.data)&&typeof w.sourceImportId==='string'))throw Error('Некорректные карточки тренировок');
    if(new Set([...workouts,...draftWorkouts].map(w=>w.id)).size!==workouts.length+draftWorkouts.length)throw Error('Повторяющиеся карточки');
    let dailyEntries=value.dailyEntries;
    if(dailyEntries===undefined){
      dailyEntries={};
      // Recover previously saved daily ChatGPT data once. An explicit empty
      // journal stays empty after a user deletes an entry.
      for(const item of imports){
        try{const parsed=nutritionPatch(item.payload);if(parsed)dailyEntries[parsed.date]={...dailyEntries[parsed.date],...parsed.values};}catch{/* Original import remains available in the backup. */}
      }
    }
    if(!plain(dailyEntries))throw Error('Некорректный журнал питания');
    const normalizedDays={};
    for(const [date,entry] of Object.entries(dailyEntries)){
      if(!validDate(date))throw Error('Некорректная дата журнала питания');
      normalizedDays[date]=dailyRecord(entry);
    }
    return {workouts,imports:copy(imports),activityDays:copy(activityDays),trainingDays:copy(trainingDays),draftWorkouts:copy(draftWorkouts),dailyEntries:normalizedDays,settings:plain(value.settings)?copy(value.settings):{}};
  }
  const dailyFields=['calories','protein','fat','carbs','weight'];
  function dailyRecord(value){
    if(!plain(value))throw Error('Некорректная запись за день');
    const result={};
    for(const key of dailyFields){
      const n=value[key]??null;
      if(n!==null&&(!Number.isFinite(n)||n<0||(key==='weight'&&n===0)))throw Error(key==='weight'?'Утренний вес должен быть положительным числом':'КБЖУ должны быть неотрицательными числами');
      result[key]=n;
    }
    if(dailyFields.every(key=>result[key]===null))throw Error('Укажите хотя бы один показатель за день');
    return result;
  }
  function nutritionPatch(payload,today){
    if(!plain(payload))return null;
    const source=plain(payload.nutrition)?payload.nutrition:{};
    const raw={calories:source.calories??source.kcal,protein:source.protein??source.proteins,fat:source.fat??source.fats,carbs:source.carbs??source.carbohydrates,weight:payload.morningWeight??payload.weight};
    const values={};
    for(const key of dailyFields){
      if(raw[key]===undefined||raw[key]===null||raw[key]==='')continue;
      const v=raw[key];
      if(typeof v!=='number'&&!(typeof v==='string'&&/^\s*\d+(?:[.,]\d+)?\s*$/.test(v)))throw Error('Проверьте числовые значения КБЖУ и веса');
      values[key]=typeof v==='number'?v:Number(v.trim().replace(',','.'));
    }
    if(!Object.keys(values).length)return null;
    const date=payload.date??today;
    if(!validDate(date))throw Error('Укажите дату питания в формате ГГГГ-ММ-ДД');
    dailyRecord(values);
    return {date,values};
  }
  function treadmillAverage(workouts){
    const times=workouts.map(w=>w.type==='Беговая дорожка'?w.duration:w.treadmillDuration).filter(n=>Number.isFinite(n)&&n>0);
    return times.length?times.reduce((sum,n)=>sum+n,0)/times.length:null;
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
  const empty=()=>({workouts:[],imports:[],activityDays:{},trainingDays:{},draftWorkouts:[],dailyEntries:{},settings:{}});
  const api={types,validDate,workout,state,empty,importCards,blankExercise,exerciseRows,dailyRecord,nutritionPatch,treadmillAverage,dailyFields};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitData=api;
})(globalThis);
