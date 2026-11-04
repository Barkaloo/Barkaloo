const {test}=require('node:test');const assert=require('node:assert/strict');const Data=require('../data.js');
const saved=(id,payload)=>({id,payload,receivedAt:'2026-11-04T09:00:00Z'});
test('daily values preserve real zeroes and keep missing values null',()=>{
 assert.deepEqual(Data.dailyRecord({calories:0,weight:79.4}),{calories:0,protein:null,fat:null,carbs:null,weight:79.4});assert.deepEqual(Data.dailyRecord({protein:150}),{calories:null,protein:150,fat:null,carbs:null,weight:null});
});
test('empty, negative, nonfinite values and zero morning weight cannot replace a valid day',()=>{
 for(const value of [{},{calories:-1},{weight:0},{fat:NaN},{carbs:Infinity},{protein:'150'}])assert.throws(()=>Data.dailyRecord(value));
});
test('nutrition imports produce only provided fields and accept decimal comma',()=>{
 assert.deepEqual(Data.nutritionPatch({date:'2026-11-04',morningWeight:'79,4',nutrition:{kcal:0,protein:150}}),{date:'2026-11-04',values:{calories:0,protein:150,weight:79.4}});
 assert.deepEqual(Data.nutritionPatch({weight:80},'2026-11-03'),{date:'2026-11-03',values:{weight:80}});assert.equal(Data.nutritionPatch({date:'2026-11-04',workout:{exercises:['Жим']}}),null);
});
test('invalid dates or quantities reject nutrition import without creating partial rows',()=>{
 assert.throws(()=>Data.nutritionPatch({date:'2026-02-30',weight:80}));assert.throws(()=>Data.nutritionPatch({date:'2026-11-04',nutrition:{protein:-1},weight:80}));assert.throws(()=>Data.nutritionPatch({date:'2026-11-04',weight:true}));
});
test('older saved ChatGPT nutrition is recovered once and partial days merge by date',()=>{
 const value=Data.state({workouts:[],imports:[saved('a',{date:'2026-11-01',weight:80,nutrition:{calories:2200}}),saved('b',{date:'2026-11-01',nutrition:{protein:150}}),saved('bad',{date:'wrong',weight:-1})]});assert.deepEqual(value.dailyEntries,{'2026-11-01':{calories:2200,protein:150,fat:null,carbs:null,weight:80}});value.dailyEntries={};assert.deepEqual(Data.state(value).dailyEntries,{});assert.equal(value.imports.length,3);
});
test('existing canonical journal wins over old import payloads and blank values stay blank',()=>{
 const value=Data.state({workouts:[],imports:[saved('old',{date:'2026-11-01',weight:80})],dailyEntries:{'2026-11-01':{weight:79.4,calories:0}}});assert.equal(value.dailyEntries['2026-11-01'].weight,79.4);assert.equal(value.dailyEntries['2026-11-01'].protein,null);assert.throws(()=>Data.state({...value,dailyEntries:{'2026-02-30':{weight:80}}}));
});
test('treadmill average divides by timed sessions, including treadmill portions of strength workouts',()=>{
 assert.equal(Data.treadmillAverage([{type:'Беговая дорожка',duration:30},{type:'Беговая дорожка',duration:60},{type:'Силовая',duration:75,treadmillDuration:15},{type:'Силовая',duration:90},{type:'Бег',duration:45},{type:'Силовая',treadmillDuration:0}]),35);
 assert.equal(Data.treadmillAverage([{type:'Силовая',duration:60,treadmillDistance:3}]),null);assert.equal(Data.treadmillAverage([]),null);
});
