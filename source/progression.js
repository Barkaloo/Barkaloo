(function(root){
 'use strict';
 function count(value){return Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0}
 function history(word){
  const values=Array.isArray(word.productionHistory)?word.productionHistory.filter(x=>typeof x==='boolean'):[];
  const size=word.productionWindowCount==null?values.length:Math.min(values.length,count(word.productionWindowCount));
  return size?values.slice(-size):[];
 }
 function evaluate(word){
  const before=word.kind,h=history(word);
  if(before==='passive'&&h.length>=5&&h.slice(-5).filter(Boolean).length>=4)word.kind='active';
  else if(before==='active'&&((h.length>=10&&h.slice(-10).filter(Boolean).length<7)||(h.length>=3&&h.slice(-3).every(x=>!x))))word.kind='passive';
  return word.kind===before?null:word.kind;
 }
 function production(word,ok){
  word.correct=count(word.correct)+(ok?1:0);word.wrong=count(word.wrong)+(ok?0:1);word.uses=count(word.uses??(word.correct+word.wrong-1))+1;
  word.productionHistory=[...(Array.isArray(word.productionHistory)?word.productionHistory.filter(x=>typeof x==='boolean'):[]),!!ok].slice(-30);
  if(word.productionWindowCount!=null)word.productionWindowCount=Math.min(30,count(word.productionWindowCount)+1);
  return evaluate(word);
 }
 function aggregate(word,correct,wrong){
  correct=count(correct);wrong=count(wrong);if(!correct&&!wrong)return;
  word.uses=count(word.uses??(count(word.correct)+count(word.wrong)))+correct+wrong;
  word.correct=count(word.correct)+correct;word.wrong=count(word.wrong)+wrong;
  // Keep known history, but do not pretend that unordered totals reveal the latest answers.
  word.productionWindowCount=0;
 }
 const api={count,history,evaluate,production,aggregate};if(typeof module==='object')module.exports=api;else root.BarkalooProgression=api;
})(globalThis);
