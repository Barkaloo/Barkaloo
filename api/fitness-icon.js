// A same-origin PNG fallback when deployment-time artwork download was blocked.
// Only our fixed, public logo can be fetched; users cannot proxy arbitrary URLs.
const {download,renderIcon,LOGO}=require('../scripts/build-fitness-assets.cjs');
let pending=null;
async function logo(){if(!pending)pending=download(LOGO).catch(error=>{pending=null;throw error;});return pending;}
async function serveIcon(req,res,load=logo){
 const size=Number(new URL(req.url,'https://barkaloo.invalid').searchParams.get('size'));
 if(![32,128,180,192,512].includes(size)){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'invalid_icon_size'}));return;}
 try{
  const png=await renderIcon(await load(),size);
  res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public, max-age=86400, s-maxage=31536000, immutable');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=200;res.end(png);
 }catch{res.statusCode=502;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'icon_unavailable'}));}
}
module.exports=(req,res)=>serveIcon(req,res);
module.exports.serveIcon=serveIcon;
