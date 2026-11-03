(function(root){
  'use strict';
  const key=value=>String(value||'').trim().toLowerCase();
  const count=value=>Math.max(0,Number(value)||0);
  function attempts(word){return count(word.uses ?? (count(word.correct)+count(word.wrong)))}
  function select(type,words,core,progress,hasExamples){
    const unique=list=>[...new Map(list.map(item=>[key(item.word),item])).values()];
    const tie=(a,b)=>key(a.word).localeCompare(key(b.word),'en');
    if(type==='new'){
      const known=new Set(words.filter(w=>w.kind!=='general').map(w=>key(w.word)));
      return unique(core).filter(w=>!known.has(key(w.word))&&hasExamples(w.word))
        .sort((a,b)=>count(progress[key(a.word)]?.lessonUses)-count(progress[key(b.word)]?.lessonUses)||(a.rank||99999)-(b.rank||99999)||tie(a,b)).slice(0,10);
    }
    const passive=unique(words.filter(w=>w.kind==='passive'));
    if(type==='daily')return passive.sort((a,b)=>attempts(a)-attempts(b)||tie(a,b)).slice(0,100);
    if(type==='errors')return passive.filter(w=>count(w.correct)+count(w.wrong)>0)
      .sort((a,b)=>count(a.correct)/(count(a.correct)+count(a.wrong))-count(b.correct)/(count(b.correct)+count(b.wrong))||count(b.wrong)-count(a.wrong)||attempts(a)-attempts(b)||tie(a,b)).slice(0,100);
    return [];
  }
  function create(type,items,date){return {version:1,id:Date.now()+'-'+Math.random().toString(36).slice(2),type,date,
    queue:items.map(item=>({word:item.word,translation:item.translation||'',rank:item.rank||item.coreRank||null})),
    phase:type==='new'?'study':'test',studyIndex:0,index:0,results:[]};}
  function valid(session){return session?.version===1&&['daily','errors','new'].includes(session.type)&&Array.isArray(session.queue)&&session.queue.length>0&&session.queue.length<=100&&session.queue.every(x=>typeof x.word==='string')&&Array.isArray(session.results)&&Number.isInteger(session.index)&&session.index>=0&&session.index<=session.queue.length&&Number.isInteger(session.studyIndex)&&session.studyIndex>=0&&session.studyIndex<=session.queue.length&&['study','test','complete'].includes(session.phase);}
  const api={attempts,select,create,valid};
  if(typeof module==='object')module.exports=api;else root.BarkalooLessons=api;
})(typeof globalThis==='object'?globalThis:this);
