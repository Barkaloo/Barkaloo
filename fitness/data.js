(function(root){
  'use strict';
  const types=['Силовая','Бег','Беговая дорожка','Велосипед','Ходьба','Йога'];
  const copy=value=>JSON.parse(JSON.stringify(value));
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return Number.isFinite(+d)&&d.getFullYear()===+s.slice(0,4)&&d.getMonth()+1===+s.slice(5,7)&&d.getDate()===+s.slice(8,10);}
  function workout(w){
    if(!plain(w)||typeof w.id!=='string'||!w.id||typeof w.title!=='string'||!w.title.trim()||w.title.length>80||!types.includes(w.type)||!validDate(w.date)||!Number.isFinite(w.duration)||w.duration<1||w.duration>1440||!Number.isFinite(w.distance)||w.distance<0||w.distance>1000)throw Error('Некорректная запись тренировки');
    for(const k of ['notes','feeling'])if(w[k]!==undefined&&typeof w[k]!=='string')throw Error('Некорректные заметки');
    for(const k of ['treadmillDistance','treadmillDuration'])if(w[k]!==undefined&&(!Number.isFinite(w[k])||w[k]<0||w[k]>(k==='treadmillDuration'?w.duration:1000)))throw Error('Проверьте показатели дорожки');
    return copy(w);
  }
  function state(value){
    if(!plain(value)||!Array.isArray(value.workouts))throw Error('Некорректные фитнес-данные');
    const workouts=value.workouts.map(workout);
    if(new Set(workouts.map(w=>w.id)).size!==workouts.length)throw Error('Повторяющиеся тренировки');
    const imports=value.imports||[];
    if(!Array.isArray(imports)||!imports.every(i=>plain(i)&&typeof i.id==='string'&&typeof i.receivedAt==='string'&&plain(i.payload)))throw Error('Некорректные данные импорта');
    return {workouts,imports:copy(imports),settings:plain(value.settings)?copy(value.settings):{}};
  }
  const empty=()=>({workouts:[],imports:[],settings:{}});
  const api={types,validDate,workout,state,empty};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitData=api;
})(globalThis);
