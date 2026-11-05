(function(root){
 'use strict';
 const I=typeof module!=='undefined'&&module.exports?require('./insights.js'):root.FitInsights;
 const timeMinutes=time=>time===null?null:Number(time.slice(0,2))*60+Number(time.slice(3));
 function offset(key,days){const d=I.date(key);d.setDate(d.getDate()+days);return I.dateKey(d);}
 function duration(record){
  if(record.bedtime===null||record.wakeTime===null)return {inBed:null,minutes:null};
  const inBed=(timeMinutes(record.wakeTime)-timeMinutes(record.bedtime)+1440)%1440;
  return {inBed,minutes:record.latency===null?null:inBed-record.latency};
 }
 function clockSummary(times){
  if(!times.length)return {average:null,deviation:null,count:0};
  const values=times.map(timeMinutes),x=I.mean(values.map(v=>Math.cos(v/1440*2*Math.PI))),y=I.mean(values.map(v=>Math.sin(v/1440*2*Math.PI)));
  if(Math.hypot(x,y)<1e-8)return {average:null,deviation:null,count:times.length};
  const average=(Math.atan2(y,x)/Math.PI/2*1440+1440)%1440;
  const deviation=values.length<2?null:I.mean(values.map(v=>Math.abs((v-average+2160)%1440-720)));
  return {average,deviation,count:times.length};
 }
 function summary(state,from,to){
  const rows=Object.entries(state.sleepEntries).filter(([day])=>day>=from&&day<=to).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,...v,...duration(v)}));
  const complete=rows.filter(v=>v.minutes!==null),qualities=rows.map(v=>v.quality).filter(Number.isFinite);
  const good=complete.filter(v=>v.minutes>=420&&v.minutes<=540).length;
  return {rows,count:complete.length,average:I.mean(complete.map(v=>v.minutes)),quality:I.mean(qualities),qualityCount:qualities.length,good,goodPercent:complete.length?good/complete.length*100:null,bedtime:clockSummary(rows.map(v=>v.bedtime).filter(v=>v!==null)),wakeTime:clockSummary(rows.map(v=>v.wakeTime).filter(v=>v!==null))};
 }
 function recent(state,to,days){return summary(state,offset(to,1-days),to);}
 function trainingComparison(state,from,to){
  // A record is keyed by the morning it ended, so it precedes that day's workout.
  return state.workouts.filter(w=>w.type==='Силовая'&&w.date>=from&&w.date<=to).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(workout=>{
   const record=state.sleepEntries[workout.date];
   return {workout,sleep:record?{...record,...duration(record)}:null};
  });
 }
 const api={timeMinutes,offset,duration,clockSummary,summary,recent,trainingComparison};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitSleep=api;
})(globalThis);
