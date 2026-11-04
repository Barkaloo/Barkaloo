const fs = require('node:fs');
const path = require('node:path');
const { readArchive } = require('./archive.cjs');

const { html } = readArchive();
const cloud = fs.readFileSync(path.join(__dirname, 'source/cloud-sync.js'), 'utf8');
const cloudUI = fs.readFileSync(path.join(__dirname, 'source/cloud-ui.js'), 'utf8');
for (const marker of ['<!-- BARKALOO_CLOUD_RUNTIME -->', '<!-- BARKALOO_CLOUD_UI -->', '<!-- BARKALOO_LESSONS -->','<!-- BARKALOO_PROGRESSION -->','<!-- BARKALOO_PROGRESS -->']) {
  if (html.toString('utf8').split(marker).length !== 2) throw new Error('Missing or duplicated cloud integration marker');
}
const progress=fs.readFileSync(path.join(__dirname,'source/progress.js'),'utf8');
const progression=fs.readFileSync(path.join(__dirname,'source/progression.js'),'utf8');
const lessons=fs.readFileSync(path.join(__dirname,'source/lessons.js'),'utf8');
const examples=JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname,'source/lesson-examples.json'),'utf8')));
const logo=fs.readFileSync(path.join(__dirname,'source/logo-character.png'));
if(!logo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Character logo must be a PNG');
if(html.toString('utf8').split('__BARKALOO_CHARACTER_LOGO__').length!==2)throw new Error('Missing or duplicated character logo marker');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
const pwa = '<link rel="manifest" href="./manifest.webmanifest">\n';
const startup = `<script>if('serviceWorker' in navigator&&location.protocol!=='file:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));}</script>\n`;
const page = html.toString('utf8')
  .replace('__BARKALOO_CHARACTER_LOGO__',()=> 'data:image/png;base64,'+logo.toString('base64'))
  .replace('<!-- BARKALOO_PROGRESS -->',()=>'<script>\n'+progress+'\n</script>')
  .replace('<!-- BARKALOO_PROGRESSION -->',()=>'<script>\n'+progression+'\n</script>')
  .replace('<!-- BARKALOO_LESSONS -->',()=>'<script>\n'+lessons+'\nconst LESSON_EXAMPLES='+examples.replace(/</g,'\\u003c')+';\n</script>')
  .replace('<!-- BARKALOO_CLOUD_RUNTIME -->', () => '<script>\n' + cloud + '\n</script>')
  .replace('<!-- BARKALOO_CLOUD_UI -->', () => '<script>\n' + cloudUI + '\n</script>')
  .replace('</head>', pwa + '</head>').replace('</body>', startup + '</body>');
// Both static hosting from the checkout and hosting dist serve the complete app.
// Neither entry point needs the archive manifest or chunks at runtime.
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
fs.writeFileSync(path.join(output, 'index.html'), page);
for (const file of ['manifest.webmanifest', 'icon.svg', 'sw.js', 'apple-touch-icon.png']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
fs.mkdirSync(path.join(output,'icons'),{recursive:true});
for(const file of ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon-32.png']){
  fs.copyFileSync(path.join(__dirname,'icons',file),path.join(output,'icons',file));
}
// Publish the independent training prototype at /fitness/ alongside English.
const fitnessOutput = path.join(output, 'fitness');
fs.mkdirSync(fitnessOutput, { recursive: true });
for (const file of ['index.html', 'app.js', 'barkaloo.css', 'style.css']) {
  fs.copyFileSync(path.join(__dirname, 'fitness', file), path.join(fitnessOutput, file));
}
fs.cpSync(path.join(__dirname, 'fitness', 'assets'), path.join(fitnessOutput, 'assets'), { recursive: true });
// Remove archive copies left behind by the previous build format.
for (const file of ['archive.json', ...fs.readdirSync(output).filter(file => /^app-.*\.b64$/.test(file))]) {
  fs.rmSync(path.join(output, file), { force: true });
}
console.log(`Built Barkaloo: ${html.length} bytes (SHA-256 verified)`);
