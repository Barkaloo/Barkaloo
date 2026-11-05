const {test}=require('node:test');const assert=require('node:assert/strict');const D=require('../data.js'),I=require('../insights.js');
function weigh(state,day,weight){state.dailyEntries[day]=D.dailyRecord({weight});}
test('goal uses seven weighings, not seven calendar days, and excludes future weights',()=>{
 const s=D.empty();['01','03','05','08','12','20'].forEach(day=>weigh(s,'2026-10-'+day,80));weigh(s,'2026-11-06',60);assert.equal(I.lastSeven(s,'2026-11-05').average,null);weigh(s,'2026-11-04',80);assert.equal(I.lastSeven(s,'2026-11-05').average,80);
});
test('pending goal anchors once at seven and rolling progress never resets the baseline',()=>{
 let s=D.empty();s.weightGoal={target:75,start:null,createdOn:'2026-11-01',capturedOn:null};for(let day=1;day<=6;day++)weigh(s,'2026-10-'+String(day).padStart(2,'0'),80);assert.equal(I.anchorGoal(s,'2026-11-05').weightGoal.start,null);weigh(s,'2026-10-07',80);s=I.anchorGoal(s,'2026-11-05');weigh(s,'2026-11-05',73);s=I.anchorGoal(s,'2026-11-05');assert.equal(s.weightGoal.start,80);assert.equal(I.goalView(s,'2026-11-05').current,79);assert.equal(I.goalView(s,'2026-11-05').progress,.2);
});
test('goal scale supports gain, loss, equal target and clamps values without division by zero',()=>{
 const s=D.empty();for(let day=1;day<=7;day++)weigh(s,'2026-11-0'+day,82);s.weightGoal={target:85,start:80,createdOn:'2026-11-01',capturedOn:'2026-11-01'};assert.equal(I.goalView(s,'2026-11-07').progress,.4);s.weightGoal.target=81;assert.equal(I.goalView(s,'2026-11-07').progress,1);s.weightGoal.target=75;assert.equal(I.goalView(s,'2026-11-07').progress,0);s.weightGoal.start=82;s.weightGoal.target=82;assert.equal(I.goalView(s,'2026-11-07').progress,1);delete s.dailyEntries['2026-11-01'];assert.equal(I.goalView(s,'2026-11-07').start,null);assert.equal(I.goalView(s,'2026-11-07').progress,null);
});
test('statistics use inclusive dates and actual denominators, including recorded zero calories',()=>{
 const s=D.empty();s.dailyEntries={'2026-11-01':D.dailyRecord({weight:80,calories:0}),'2026-11-03':D.dailyRecord({weight:78,calories:2200,protein:150}),'2026-11-04':D.dailyRecord({protein:130})};const v=I.statistics(s,'2026-11-01','2026-11-03');assert.equal(v.weightAverage,79);assert.equal(v.weighings.length,2);assert.equal(v.nutrition.calories.average,1100);assert.equal(v.nutrition.calories.count,2);assert.equal(v.nutrition.protein.average,150);assert.equal(v.nutrition.fat.average,null);assert.equal(v.weekly.reduce((n,w)=>n+w.count,0),2);assert.throws(()=>I.statistics(s,'2026-11-03','2026-11-01'));
});
test('non-training flags never add strength workouts, and unchecked treadmill metrics are excluded',()=>{
 const s=D.empty();s.extraActivity={'2026-11-01':D.activityRecord({treadmill:true,distance:2,duration:20,posture:true}),'2026-11-02':D.activityRecord({treadmill:false,distance:5,duration:50,forearms:true})};const v=I.statistics(s,'2026-11-01','2026-11-02');assert.equal(v.strengthCount,0);assert.equal(v.activeDays,2);assert.equal(v.postureDays,1);assert.equal(v.forearmDays,1);assert.equal(v.treadmill.distance,2);assert.equal(v.treadmill.average,20);
});
test('treadmill totals include separately entered activity and legacy workout sessions',()=>{
 const s=D.empty();s.workouts=[{id:'a',type:'Беговая дорожка',duration:30,distance:4,date:'2026-11-01'}];s.extraActivity={'2026-11-02':D.activityRecord({treadmill:true,duration:10,distance:1})};const v=I.statistics(s,'2026-11-01','2026-11-02');assert.equal(v.treadmill.average,20);assert.equal(v.treadmill.distance,5);assert.equal(I.statistics(s,'2026-11-02','2026-11-02').treadmill.average,10);
});
test('a treadmill check without numbers leaves metrics unknown and preserves recorded zero',()=>{
 const s=D.empty();s.extraActivity={'2026-11-01':D.activityRecord({treadmill:true})};let v=I.statistics(s,'2026-11-01','2026-11-01').treadmill;assert.equal(v.sessions,1);assert.equal(v.distance,null);assert.equal(v.minutes,null);assert.equal(v.average,null);s.extraActivity['2026-11-01'].distance=0;v=I.statistics(s,'2026-11-01','2026-11-01').treadmill;assert.equal(v.distance,0);
});
test('measurement checkpoints are dated, partial, range-filtered and validated',()=>{
 const s=D.empty();s.measurements={'2026-10-01':D.measurementRecord({waist:86}),'2026-11-01':D.measurementRecord({waist:84,chest:100})};const v=I.statistics(s,'2026-11-01','2026-11-05');assert.equal(v.measurements.length,1);assert.equal(v.measurements[0][1].hips,null);assert.throws(()=>D.measurementRecord({waist:0}));assert.throws(()=>D.measurementRecord({}));assert.throws(()=>D.activityRecord({posture:'yes'}));assert.throws(()=>D.activityRecord({distance:-1}));
});
