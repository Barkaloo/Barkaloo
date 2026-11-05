(function(root){
 'use strict';
 const Data=typeof module!=='undefined'&&module.exports?require('./data.js'):root.FitData;
 const mean=values=>values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;
 const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const date=s=>new Date(s+'T12:00:00');
 function weights(state,until){return Object.entries(state.dailyEntries).filter(([day,v])=>day<=until&&Number.isFinite(v.weight)&&v.weight>0).sort(([a],[b])=>a.localeCompare(b)).map(([day,v])=>({date:day,weight:v.weight}));}
 function lastSeven(state,today){const samples=weights(state,today).slice(-7);return {samples,count:samples.length,average:samples.length===7?mean(samples.map(v=>v.weight)):null};}
 function anchorGoal(state,today){const recent=lastSeven(state,today);if(state.weightGoal&&state.weightGoal.start===null&&recent.average!==null)return {...state,weightGoal:{...state.weightGoal,start:recent.average,capturedOn:today}};return state;}
 function goalView(state,today){const recent=lastSeven(state,today),goal=state.weightGoal;const start=recent.average===null?null:(goal?goal.start:recent.average);let progress=null;
  if(goal&&start!==null&&recent.average!==null){const delta=goal.target-start;progress=Math.abs(delta)<0.000001?(Math.abs(recent.average-goal.target)<0.000001?1:0):(recent.average-start)/delta;progress=Math.max(0,Math.min(1,progress));}
  return {start,current:recent.average,target:goal?.target??null,count:recent.count,progress};
 }
 function treadmillRecords(state){
  const rows=[];state.workouts.forEach(w=>{if(w.type==='Беговая дорожка'||w.treadmillDuration>0||w.treadmillDistance>0)rows.push({date:w.date,distance:w.type==='Беговая дорожка'?w.distance:(w.treadmillDistance??null),duration:w.type==='Беговая дорожка'?w.duration:(w.treadmillDuration??null)});});
  Object.entries(state.extraActivity).forEach(([day,v])=>{if(v.treadmill)rows.push({date:day,distance:v.distance,duration:v.duration});});return rows;
 }
 function treadmillSummary(rows){const durations=rows.map(v=>v.duration).filter(Number.isFinite),timed=durations.filter(v=>v>0),distances=rows.map(v=>v.distance).filter(Number.isFinite);return {sessions:rows.length,distance:distances.length?distances.reduce((sum,v)=>sum+v,0):rows.length?null:0,minutes:durations.length?durations.reduce((sum,v)=>sum+v,0):rows.length?null:0,average:mean(timed),timed:timed.length};}
 function statistics(state,from,to){
  if(!Data.validDate(from)||!Data.validDate(to)||from>to)throw Error('Проверьте начало и конец периода');
  const inRange=day=>day>=from&&day<=to;
  const records=Object.entries(state.dailyEntries).filter(([day])=>inRange(day));
  const weighings=weights(state,to).filter(v=>inRange(v.date));
  const strength=state.workouts.filter(w=>w.type==='Силовая'&&inRange(w.date));
  const timed=strength.map(w=>w.duration).filter(Number.isFinite);
  const extra=Object.entries(state.extraActivity).filter(([day])=>inRange(day));
  const weekly=new Map();weighings.forEach(v=>{const monday=date(v.date);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);const key=dateKey(monday);if(!weekly.has(key))weekly.set(key,[]);weekly.get(key).push(v);});
  return {weightAverage:mean(weighings.map(v=>v.weight)),weighings,strengthCount:strength.length,strengthMinutes:timed.length?timed.reduce((s,n)=>s+n,0):null,treadmill:treadmillSummary(treadmillRecords(state).filter(v=>inRange(v.date))),activeDays:extra.filter(([,v])=>v.treadmill||v.posture||v.forearms).length,postureDays:extra.filter(([,v])=>v.posture).length,forearmDays:extra.filter(([,v])=>v.forearms).length,homeMarks:Object.keys(state.activityDays).filter(inRange).length,trainingMarks:Object.keys(state.trainingDays).filter(inRange).length,nutrition:Object.fromEntries(['calories','protein','fat','carbs'].map(field=>{const numbers=records.map(([,v])=>v[field]).filter(Number.isFinite);return [field,{average:mean(numbers),count:numbers.length}];})),weekly:[...weekly].map(([monday,items])=>{const end=date(monday);end.setDate(end.getDate()+6);return {from:monday<from?from:monday,to:dateKey(end)>to?to:dateKey(end),count:items.length,average:mean(items.map(v=>v.weight))};}),measurements:Object.entries(state.measurements).filter(([day])=>inRange(day)).sort(([a],[b])=>b.localeCompare(a))};
 }
 const api={mean,dateKey,date,weights,lastSeven,anchorGoal,goalView,treadmillRecords,treadmillSummary,statistics};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitInsights=api;
})(globalThis);
