const {test}=require('node:test');const assert=require('node:assert/strict');const {CloudSync}=require('../cloud-sync.js');const Data=require('../data.js');const {backend}=require('../../test/supabase-fake.cjs');
function device(t,server,opts={}){let value=Data.empty();const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const client=new CloudSync({url:'https://backend.example.test',key:'public-key',redirectTo:'https://barkaloo-web.vercel.app/fitness/',storage,online:()=>true,fetch:server.fetch,read:()=>value,apply:v=>{value=v;},...opts});t.after(()=>client.dispose());return client;}
test('confirmation signup and resend target the fitness URL; cooldown prevents duplicate email requests',async t=>{
 const server=backend();server.confirmation=true;const urls=[];const client=device(t,server,{fetch:(url,options)=>{urls.push(url);return server.fetch(url,options);}});
 await client.signUp('person@example.test','test-password');assert.equal(client.phase,'confirm');assert.equal(new URL(urls[0]).searchParams.get('redirect_to'),'https://barkaloo-web.vercel.app/fitness/');await assert.rejects(client.resendConfirmation('person@example.test'),e=>e.code==='local_email_cooldown');assert.equal(server.resends,0);
 client.emailCooldownUntil=0;await client.resendConfirmation('person@example.test');assert.equal(server.resends,1);assert.equal(new URL(urls[1]).searchParams.get('redirect_to'),'https://barkaloo-web.vercel.app/fitness/');assert.equal(client.phase,'confirm');await assert.rejects(client.resendConfirmation('person@example.test'));assert.equal(server.resends,1);
});
test('real GoTrue top-level User confirmation response is accepted without inventing a session',async t=>{
 const client=device(t,backend(),{fetch:async()=>new Response(JSON.stringify({id:'person',identities:[]}))});await client.signUp('person@example.test','test-password');assert.equal(client.phase,'confirm');assert.equal(client.session,null);
});
test('email provider error codes remain available; failed resend never reports accepted delivery',async t=>{
 const server=backend();server.emailError={status:429,code:'over_email_send_rate_limit',message:'Email rate limit exceeded'};const client=device(t,server);await assert.rejects(client.resendConfirmation('person@example.test'),e=>e.code==='over_email_send_rate_limit'&&e.status===429);assert.equal(client.phase,'local');assert(client.emailCooldownUntil>Date.now());
});
test('email callback verifies the account before saving a session and syncing',async t=>{
 const client=device(t,backend());await client.consumeCallback('#access_token=token-person&refresh_token=refresh-person&expires_in=3600');assert.equal(client.session.user.id,'person');assert.equal(client.phase,'synced');
});
test('expired callback and invalid JWT cannot create a logged-in session',async t=>{
 const client=device(t,backend());await client.consumeCallback('#error=access_denied&error_description=expired');assert.equal(client.phase,'error');assert.equal(client.session,null);await client.consumeCallback('#access_token=invalid&refresh_token=invalid');assert.equal(client.phase,'error');assert.equal(client.session,null);
});
