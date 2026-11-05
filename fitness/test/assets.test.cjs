const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const sharp=require('sharp');const {prepare,LOGO,BACKGROUND}=require('../../scripts/build-fitness-assets.cjs');
test('deployment produces correctly sized local PWA icons and retains the background bytes',async()=>{
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'barkaloo-fit-assets-'));
 try{
  for(const name of ['index.html','style.css','manifest.webmanifest'])await fs.copyFile(path.join(__dirname,'..',name),path.join(out,name));
  // Deliberate test images, not the production Pinterest artwork.
  const portrait=await sharp({create:{width:736,height:732,channels:3,background:'#546576'}}).jpeg().toBuffer();
  const landscape=await sharp({create:{width:736,height:414,channels:3,background:'#201045'}}).jpeg().toBuffer();
  const urls=[];await prepare(out,async url=>{urls.push(url);return url===LOGO?portrait:landscape});
  assert.deepEqual(new Set(urls),new Set([LOGO,BACKGROUND]));
  for(const [file,size] of [['fit-logo.png',128],['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){const meta=await sharp(path.join(out,'assets',file)).metadata();assert.equal(meta.width,size);assert.equal(meta.height,size);assert.equal(meta.format,'png');}
  assert.deepEqual(await fs.readFile(path.join(out,'assets/fit-background.jpg')),landscape);
  const html=await fs.readFile(path.join(out,'index.html'),'utf8');assert(!html.includes(LOGO));assert(html.includes('assets/apple-touch-icon.png?v=8'));assert(html.includes('assets/favicon-32.png?v=8'));assert(html.includes('src="assets/fit-logo.png"'));
  const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.webmanifest'),'utf8'));assert.equal(manifest.name,'Barkaloo Fit');assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
  assert(!(await fs.readFile(path.join(out,'style.css'),'utf8')).includes(BACKGROUND));
 }finally{await fs.rm(out,{recursive:true,force:true});}
});
test('background failure does not prevent generation of local install icons',async()=>{
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'barkaloo-fit-icon-'));
 try{for(const file of ['index.html','style.css','manifest.webmanifest'])await fs.copyFile(path.join(__dirname,'..',file),path.join(out,file));const logo=await sharp({create:{width:736,height:732,channels:3,background:'#405060'}}).jpeg().toBuffer();await prepare(out,async url=>{if(url===BACKGROUND)throw Error('fixture background unavailable');return logo;});assert.equal((await sharp(path.join(out,'assets/apple-touch-icon.png')).metadata()).width,180);assert((await fs.readFile(path.join(out,'index.html'),'utf8')).includes('assets/apple-touch-icon.png?v=8'));}finally{await fs.rm(out,{recursive:true,force:true});}
});
test('fallback manifest and Apple metadata always use same-origin, sized PNGs',async()=>{
 const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8'),manifest=JSON.parse(await fs.readFile(path.join(__dirname,'../manifest.webmanifest'),'utf8'));assert(html.includes('rel="apple-touch-icon" sizes="180x180" href="/api/fitness-icon?size=180'));assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);assert(manifest.icons.every(i=>i.src.startsWith('/api/fitness-icon?')&&i.type==='image/png'));
});
test('icon endpoint returns actual square PNGs of the requested size and rejects arbitrary sources',async()=>{
 const {serveIcon}=require('../../api/fitness-icon.js');const bytes=await sharp({create:{width:736,height:732,channels:3,background:'#203040'}}).jpeg().toBuffer();
 for(const size of [32,180,192,512]){const headers={};let body;const res={setHeader:(k,v)=>headers[k]=v,end:v=>body=v};await serveIcon({url:'/api/fitness-icon?size='+size},res,async()=>bytes);assert.equal(res.statusCode,200);assert.equal(headers['Content-Type'],'image/png');const image=await sharp(body).metadata();assert.equal(image.width,size);assert.equal(image.height,size);}
 let called=false;const res={setHeader(){},end(){}};await serveIcon({url:'/api/fitness-icon?size=999&url=https://elsewhere.invalid'},res,async()=>{called=true;return bytes;});assert.equal(res.statusCode,400);assert.equal(called,false);
});
