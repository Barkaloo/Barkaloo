// Export the reviewed app artwork at the sizes required by phone launchers.
// Requires the existing development Playwright/Chromium; normal builds use committed PNGs.
const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'..'),master=fs.readFileSync(path.join(root,'source/app-icon-master.png'));
 const source='data:image/png;base64,'+master.toString('base64');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const directory=path.join(root,'icons');fs.mkdirSync(directory,{recursive:true});
  for(const [name,size,padding] of [['icon-192.png',192,0],['icon-512.png',512,0],['icon-maskable-512.png',512,96],['apple-touch-icon.png',180,0],['favicon-32.png',32,0]]){
   const p=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
   await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;background:#000000;display:flex;align-items:center;justify-content:center"><img src="${source}" style="display:block;width:${size-2*padding}px;height:${size-2*padding}px;object-fit:contain"></body></html>`);
   await p.locator('img').evaluate(img=>img.decode());await p.screenshot({path:path.join(directory,name),omitBackground:false});await p.close();
  }
  fs.copyFileSync(path.join(directory,'apple-touch-icon.png'),path.join(root,'apple-touch-icon.png'));
  fs.writeFileSync(path.join(root,'icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#000000"/><image width="512" height="512" href="${source}"/></svg>\n`);
  console.log('Exported 192/512 PNGs, maskable icon, Apple 180px icon, favicon and legacy SVG.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
