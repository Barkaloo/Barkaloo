// On Vercel, retain the user's original images as local deployment assets and
// export real PNG sizes for browser/iOS/Android. Source HTML also works directly
// with the supplied URLs when asset preparation isn't available.
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const LOGO='https://i.pinimg.com/736x/9e/b4/54/9eb454bde90e9f6a15e34e91dabd7b9f.jpg';
const BACKGROUND='https://i.pinimg.com/736x/b7/ee/bc/b7eebc948371791c2888da0e81837fe8.jpg';
async function download(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Barkaloo-Fit-Asset-Build/1.0'}});
 if(!response.ok)throw Error(`Image download: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw Error('Image is too large');
 const info=await sharp(bytes).metadata();if(!info.width||!info.height)throw Error('Invalid image');return bytes;
}
async function prepare(output,load=download){
 const [logo,background]=await Promise.all([load(LOGO),load(BACKGROUND)]);
 const assets=path.join(output,'assets');await fs.mkdir(assets,{recursive:true});
 await fs.writeFile(path.join(assets,'fit-background.jpg'),background);
 const square=size=>sharp(logo).rotate().resize(size,size,{fit:'contain',background:'#101114'}).png().toBuffer();
 for(const [file,size] of [['fit-logo.png',128],['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]])await fs.writeFile(path.join(assets,file),await square(size));
 let html=await fs.readFile(path.join(output,'index.html'),'utf8');
 html=html.replaceAll(LOGO,'assets/fit-logo.png').replace('rel="icon" type="image/jpeg" href="assets/fit-logo.png"','rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=4"').replace('rel="apple-touch-icon" href="assets/fit-logo.png"','rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png?v=4"');
 await fs.writeFile(path.join(output,'index.html'),html);
 const css=await fs.readFile(path.join(output,'style.css'),'utf8');await fs.writeFile(path.join(output,'style.css'),css.replaceAll(BACKGROUND,'assets/fit-background.jpg'));
 const manifest=JSON.parse(await fs.readFile(path.join(output,'manifest.webmanifest'),'utf8'));
 manifest.icons=[192,512].map(size=>({src:`assets/icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'}));
 await fs.writeFile(path.join(output,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
 console.log('Barkaloo Fit: supplied background and 32/128/180/192/512px icons prepared');
}
if(require.main===module)prepare(process.argv[2]).catch(error=>{
 // A blocked image host must not prevent the new UI from deploying.
 // In that case browsers use the original user-provided HTTPS links.
 console.warn('Barkaloo Fit image preparation unavailable:',error.message,'— using original image URLs.');
});
module.exports={prepare,LOGO,BACKGROUND};
