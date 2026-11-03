const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'../dist');const mime={'.html':'text/html','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.join(root,name==='/'?'index.html':name);if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,colorScheme:'dark'});await context.route('https://i.pinimg.com/**',route=>route.abort());
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('english_settings_v1',JSON.stringify({theme:'dark'}));window.chromeSnapshots=[];new MutationObserver(()=>{const meta=document.getElementById('appThemeColor');if(meta&&document.documentElement.dataset.theme)window.chromeSnapshots.push({theme:document.documentElement.dataset.theme,color:meta.content});}).observe(document,{subtree:true,childList:true});});
 await p.goto(origin);
 assert.match(await p.locator('meta[name="viewport"]').getAttribute('content'),/viewport-fit=cover/);
 assert.equal(await p.locator('#appThemeColor').getAttribute('content'),'#101114');assert.equal(await p.locator('#appleStatusBarStyle').getAttribute('content'),'black-translucent');
 assert.equal(await p.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 17, 20)');
 assert.equal(await p.evaluate(()=>chromeSnapshots.filter(x=>x.theme==='dark').some(x=>x.color!=='#101114')),false);
 await p.locator('#themeSelect').selectOption('light');assert.equal(await p.locator('#appThemeColor').getAttribute('content'),'#edf4ef');assert.equal(await p.locator('#appleStatusBarStyle').getAttribute('content'),'default');
 await p.locator('#themeSelect').selectOption('system');assert.equal(await p.locator('#appThemeColor').getAttribute('content'),'#101114');await p.emulateMedia({colorScheme:'light'});await p.waitForFunction(()=>document.getElementById('appThemeColor').content==='#edf4ef');
 await p.locator('#themeSelect').selectOption('dark');
 // Simulate the nonzero safe insets that device emulation cannot expose itself.
 await p.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','47px');document.documentElement.style.setProperty('--safe-bottom','34px');});
 await p.waitForFunction(()=>getComputedStyle(document.getElementById('main')).paddingTop==='63px'&&getComputedStyle(document.getElementById('main')).paddingBottom==='50px');
 assert.equal(await p.locator('#main').evaluate(el=>getComputedStyle(el).paddingTop),'63px');assert.equal(await p.locator('#main').evaluate(el=>getComputedStyle(el).paddingBottom),'50px');assert.ok((await p.locator('.topbar').boundingBox()).y>=63);
 await p.locator('#burger').click();await p.waitForFunction(()=>getComputedStyle(document.getElementById('sidebar')).paddingTop==='65px');assert.equal(await p.locator('#sidebar').evaluate(el=>getComputedStyle(el).paddingTop),'65px');await p.locator('#brandHome').click();
 const assets=await p.evaluate(async()=>{
  const manifest=await (await fetch('manifest.webmanifest')).json();
  const names=[...manifest.icons.map(i=>i.src),'./icons/apple-touch-icon.png','./icons/favicon-32.png'];
  return Promise.all(names.map(async src=>{const img=new Image();img.src=src;await img.decode();return {src,width:img.naturalWidth,height:img.naturalHeight}}));
 });assert.deepEqual(assets.map(x=>x.width),[192,512,512,180,32]);
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.reload();await context.setOffline(true);
 for(const name of ['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png?v=3','icons/favicon-32.png?v=3'])assert.equal(await p.evaluate(async name=>(await fetch(name)).status,name),200);
 await p.reload();assert.equal(await p.locator('#appThemeColor').getAttribute('content'),'#101114');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
 await p.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','47px');document.documentElement.style.setProperty('--safe-bottom','34px');});await p.waitForFunction(()=>getComputedStyle(document.getElementById('main')).paddingTop==='63px');
 await p.screenshot({path:'/tmp/barkaloo-phone-safe-area.png',animations:'disabled'});assert.deepEqual(errors,[]);
 console.log('PASS: persisted/system dark and light browser colors, early dark chrome, Apple status style, safe-area layout, PNG decode and offline icon cache');
 await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
