const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data.js'),S=require('../sleep.js');
const night=(values={})=>D.sleepRecord({bedtime:'00:30',wakeTime:'08:15',latency:15,quality:4,...values});
test('sleep duration subtracts actual latency and handles midnight',()=>{
 assert.deepEqual(S.duration(night()),{inBed:465,minutes:450});
 assert.deepEqual(S.duration(night({bedtime:'23:30',wakeTime:'07:00'})),{inBed:450,minutes:435});
 assert.equal(S.duration(night({latency:0})).minutes,465);
});
test('partial evening sleep is retained without inventing duration or ratings',()=>{
 const v=D.sleepRecord({bedtime:'23:30'});assert.equal(v.quality,null);assert.equal(S.duration(v).minutes,null);
 assert.deepEqual(S.duration(night({latency:null})),{inBed:465,minutes:null});
 const s=D.empty();s.sleepEntries={'2026-11-05':v};const summary=S.recent(s,'2026-11-05',7);assert.equal(summary.rows.length,1);assert.equal(summary.count,0);assert.equal(summary.average,null);assert.equal(summary.goodPercent,null);
});
test('invalid sleep values cannot replace valid entries',()=>{
 for(const values of [{bedtime:'24:00'},{wakeTime:'8:15'},{quality:0},{quality:6},{quality:2.5},{latency:-1},{latency:1.5},{latency:465},{wakeTime:'00:30'}])assert.throws(()=>night(values));
 assert.throws(()=>D.sleepRecord({}));assert.throws(()=>D.state({...D.empty(),sleepEntries:{'2026-02-30':night()}}));
});
test('bedtime averages and deviations wrap around midnight',()=>{
 const v=S.clockSummary(['23:50','00:10']);assert(Math.min(v.average,1440-v.average)<1e-7);assert(Math.abs(v.deviation-10)<1e-7);
 assert.equal(S.clockSummary(['01:00']).deviation,null);assert.equal(S.clockSummary([]).average,null);assert.equal(S.clockSummary(['00:00','12:00']).average,null);
});
test('sleep windows use calendar days, exclude later nights and omit missing data',()=>{
 const s=D.empty();s.sleepEntries={'2026-10-01':night({latency:0}),'2026-11-01':night(),'2026-11-05':night({wakeTime:'07:15',quality:2}),'2026-11-06':night({wakeTime:'12:15'})};const v=S.recent(s,'2026-11-05',7);
 assert.equal(v.count,2);assert.equal(v.average,420);assert.equal(v.quality,3);assert.equal(S.summary(s,'2026-11-05','2026-11-05').average,390);assert.equal(S.recent(s,'2026-11-05',30).count,2);
});
test('seven to nine hours uses inclusive boundaries and complete nights as denominator',()=>{
 const s=D.empty();[420,540,419,541].forEach((minutes,index)=>s.sleepEntries['2026-11-0'+(index+1)]=night({bedtime:'00:00',wakeTime:String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0'),latency:0}));s.sleepEntries['2026-11-05']=D.sleepRecord({quality:5});const v=S.recent(s,'2026-11-05',7);assert.equal(v.good,2);assert.equal(v.count,4);assert.equal(v.goodPercent,50);assert.equal(v.qualityCount,5);
});
test('sleep compares to the workout after that morning without marking training calendars',()=>{
 const s=D.empty();s.sleepEntries={'2026-11-05':night()};s.workouts=[{id:'today',date:'2026-11-05',type:'Силовая'},{id:'tomorrow',date:'2026-11-06',type:'Силовая'},{id:'cardio',date:'2026-11-05',type:'Бег'}];const rows=S.trainingComparison(s,'2026-11-05','2026-11-06');assert.equal(rows.length,2);assert.equal(rows.find(v=>v.workout.id==='today').sleep.minutes,450);assert.equal(rows.find(v=>v.workout.id==='tomorrow').sleep,null);assert.deepEqual(s.trainingDays,{});assert.deepEqual(s.activityDays,{});
});
test('sleep JSON supports partial updates, explicit clears and validates before use',()=>{
 const entries={'2026-11-05':night()};const v=D.sleepPatch({date:'2026-11-05',sleep:{quality:2}},undefined,entries);assert.equal(v.record.wakeTime,'08:15');assert.equal(v.record.quality,2);assert.equal(D.sleepPatch({date:v.date,sleep:{quality:null}},undefined,entries).record.quality,null);assert.throws(()=>D.sleepPatch({date:v.date,sleep:'bad'},undefined,entries));assert.throws(()=>D.sleepPatch({date:v.date,sleep:{latency:500}},undefined,entries));assert.equal(D.sleepPatch({nutrition:{}},'2026-11-05'),null);
});
test('older fitness state gets an empty sleep journal and new sleep survives normalization',()=>{
 const old={workouts:[]};assert.deepEqual(D.state(old).sleepEntries,{});const s=D.empty();s.sleepEntries={'2026-11-05':night()};assert.deepEqual(D.state(s).sleepEntries,s.sleepEntries);
});
