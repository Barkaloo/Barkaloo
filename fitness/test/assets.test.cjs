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
  const html=await fs.readFile(path.join(out,'index.html'),'utf8');assert(!html.includes(LOGO));assert(html.includes('assets/apple-touch-icon.png?v=4'));assert(html.includes('assets/favicon-32.png?v=4'));assert(html.includes('src="assets/fit-logo.png"'));
  const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.webmanifest'),'utf8'));assert.equal(manifest.name,'Barkaloo Fit');assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
  assert(!(await fs.readFile(path.join(out,'style.css'),'utf8')).includes(BACKGROUND));
 }finally{await fs.rm(out,{recursive:true,force:true});}
});
