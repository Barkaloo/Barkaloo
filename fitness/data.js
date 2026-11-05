(function(root){
  'use strict';
  const types=['Силовая','Бег','Беговая дорожка','Велосипед','Ходьба','Йога'];
  const muscleGroups={chest:'Грудь',back:'Спина',quads:'Квадрицепсы',hamstrings:'Задняя поверхность бедра',glutes:'Ягодицы',frontDelts:'Передняя дельта',sideDelts:'Средняя дельта',rearDelts:'Задняя дельта',biceps:'Бицепс',triceps:'Трицепс',calves:'Икры',abs:'Пресс',erectors:'Разгибатели спины',forearms:'Предплечья'};
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
    const extraActivity=normalizeDates(value.extraActivity??{},activityRecord);
    const measurements=normalizeDates(value.measurements??{},measurementRecord);
    const sleepEntries=normalizeDates(value.sleepEntries??{},sleepRecord);
    const weightGoal=value.weightGoal??null;
    if(weightGoal!==null&&(!plain(weightGoal)||!Number.isFinite(weightGoal.target)||weightGoal.target<=0||!validDate(weightGoal.createdOn)||(weightGoal.start!==null&&(!Number.isFinite(weightGoal.start)||weightGoal.start<=0))||(weightGoal.capturedOn!==null&&!validDate(weightGoal.capturedOn))))throw Error('Некорректная цель веса');
    const settings=plain(value.settings)?copy(value.settings):{};
    if(settings.exerciseMuscles!==undefined){
      if(!plain(settings.exerciseMuscles)||Object.keys(settings.exerciseMuscles).length>1000)throw Error('Некорректный справочник упражнений');
      settings.exerciseMuscles=Object.fromEntries(Object.entries(settings.exerciseMuscles).map(([key,mapping])=>{
        if(!key||key.length>230)throw Error('Некорректное название упражнения');
        return [key,exerciseMapping(mapping)];
      }));
    }
    return {workouts,imports:copy(imports),activityDays:copy(activityDays),trainingDays:copy(trainingDays),draftWorkouts:copy(draftWorkouts),dailyEntries:normalizedDays,extraActivity,measurements,sleepEntries,weightGoal:copy(weightGoal),settings};
  }
  function exerciseMapping(value){
    if(!plain(value)||typeof value.label!=='string'||!value.label.trim()||value.label.length>200)throw Error('Проверьте название упражнения');
    for(const field of ['primary','secondary'])if(!Array.isArray(value[field])||!value[field].every(key=>Object.hasOwn(muscleGroups,key))||new Set(value[field]).size!==value[field].length)throw Error('Проверьте мышечные группы');
    if(!value.primary.length)throw Error('Выберите хотя бы одну основную мышечную группу');
    if(value.primary.some(key=>value.secondary.includes(key)))throw Error('Одна мышца не может быть основной и вспомогательной одновременно');
    return {label:value.label.trim(),primary:[...value.primary],secondary:[...value.secondary]};
  }
  function normalizeDates(value,normalize){
    if(!plain(value))throw Error('Некорректный дневник');
    return Object.fromEntries(Object.entries(value).map(([date,entry])=>{if(!validDate(date))throw Error('Некорректная дата дневника');return [date,normalize(entry)];}));
  }
  function sleepRecord(value){
    if(!plain(value))throw Error('Сон должен быть JSON-объектом');
    const result={};
    for(const field of ['bedtime','wakeTime']){
      const time=value[field]??null;
      if(time!==null&&(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw Error('Время сна: ЧЧ:ММ');
      result[field]=time;
    }
    const latency=value.latency??null,quality=value.quality??null;
    if(latency!==null&&(!Number.isInteger(latency)||latency<0||latency>=1440))throw Error('Время засыпания: целое число минут от 0 до 1439');
    if(quality!==null&&(!Number.isInteger(quality)||quality<1||quality>5))throw Error('Качество сна: от 1 до 5');
    result.latency=latency;result.quality=quality;
    if(Object.values(result).every(v=>v===null))throw Error('Заполните хотя бы один показатель сна');
    if(result.bedtime!==null&&result.wakeTime!==null){
      const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
      const span=(minutes(result.wakeTime)-minutes(result.bedtime)+1440)%1440;
      if(span===0)throw Error('Укажите разное время отхода ко сну и подъёма');
      if(latency!==null&&latency>=span)throw Error('Время засыпания должно быть меньше времени в постели');
    }
    return result;
  }
  function sleepPatch(payload,today,previous={}){
    if(payload.sleep===undefined)return null;
    if(!plain(payload.sleep))throw Error('Сон должен быть JSON-объектом');
    const date=payload.date??today;
    if(!validDate(date))throw Error('Укажите дату пробуждения в формате ГГГГ-ММ-ДД');
    const record=sleepRecord({...previous[date],...payload.sleep});
    return {date,record};
  }
  function activityRecord(value){
    if(!plain(value))throw Error('Некорректная активность');
    const result={};
    for(const field of ['treadmill','posture','forearms']){if(value[field]!==undefined&&typeof value[field]!=='boolean')throw Error('Проверьте отметки активности');result[field]=value[field]??false;}
    for(const field of ['distance','duration']){const n=value[field]??null;if(n!==null&&(!Number.isFinite(n)||n<0||n>(field==='duration'?1440:1000)))throw Error('Проверьте дистанцию и время');result[field]=n;}
    return result;
  }
  const measurementFields={chest:'Грудь',waist:'Талия',hips:'Бёдра',arm:'Плечо',thigh:'Бедро',calf:'Голень',neck:'Шея'};
  function measurementRecord(value){
    if(!plain(value))throw Error('Некорректные замеры');const result={};
    for(const field of Object.keys(measurementFields)){const n=value[field]??null;if(n!==null&&(!Number.isFinite(n)||n<=0))throw Error('Замеры должны быть положительными числами');result[field]=n;}
    if(Object.values(result).every(n=>n===null))throw Error('Заполните хотя бы один замер');return result;
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
  const empty=()=>({workouts:[],imports:[],activityDays:{},trainingDays:{},draftWorkouts:[],dailyEntries:{},extraActivity:{},measurements:{},sleepEntries:{},weightGoal:null,settings:{}});
  const api={types,validDate,workout,state,empty,importCards,blankExercise,exerciseRows,dailyRecord,nutritionPatch,treadmillAverage,dailyFields,activityRecord,measurementRecord,measurementFields,sleepRecord,sleepPatch,muscleGroups,exerciseMapping};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitData=api;
})(globalThis);
