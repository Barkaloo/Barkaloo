(function(root){
 'use strict';
 const key=value=>String(value||'').trim().toLowerCase();
 const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
 function normalizeDate(value){
  if(typeof value!=='string'||!value.trim())return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
   const date=new Date(value+'T12:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?value:null;
  }
  const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp).toISOString():null;
 }
 function lastUsed(word,progress={}){
  const values=[word?.lastUsedAt,progress[key(word?.word)]?.lastUsedAt].map(normalizeDate).filter(Boolean);
  return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 }
 function snapshot(words,bank,stats){
  const levels=new Map(bank.map(item=>[key(item.word),'general']));
  for(const word of words){const k=key(word.word);if(!k)continue;const old=levels.get(k);if(word.kind==='active'||(word.kind==='passive'&&old!=='active'))levels.set(k,word.kind);else if(!levels.has(k))levels.set(k,'general');}
  const result={active:0,passive:0,unknown:0,trainerAttempts:count(stats.vocabCorrect)+count(stats.vocabWrong)+count(stats.verbCorrect)+count(stats.verbWrong)};
  for(const level of levels.values())result[level==='general'?'unknown':level]++;
  return result;
 }
 function record(history,date,values,at){
  const previous=history[date];if(previous&&['active','passive','unknown','trainerAttempts'].every(field=>previous[field]===values[field]))return false;
  history[date]={...values,recordedAt:at};return true;
 }
 function series(history,metric,days,today){
  const end=new Date(today+'T12:00:00Z');const start=new Date(end);if(days)start.setUTCDate(start.getUTCDate()-days+1);
  return Object.entries(history||{}).filter(([date,value])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&normalizeDate(date)&&date<=today&&(!days||date>=start.toISOString().slice(0,10))&&Number.isFinite(value?.[metric]))
   .sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value:value[metric]}));
 }
 function contextWords(words,limit=100){
  const unique=new Map();for(const word of words)if(word.kind==='passive'&&!unique.has(key(word.word)))unique.set(key(word.word),word);
  const accuracy=word=>count(word.correct)+count(word.wrong)?count(word.correct)/(count(word.correct)+count(word.wrong)):1;
  return [...unique.values()].sort((a,b)=>count(b.wrong)-count(a.wrong)||accuracy(a)-accuracy(b)||count(b.uses)-count(a.uses)||key(a.word).localeCompare(key(b.word),'en')).slice(0,limit);
 }
 const api={normalizeDate,lastUsed,snapshot,record,series,contextWords};if(typeof module==='object')module.exports=api;else root.BarkalooProgress=api;
})(globalThis);
