const fs = require('node:fs');
const path = require('node:path');
const { readArchive } = require('./archive.cjs');

const { html } = readArchive();
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
const pwa = '<link rel="manifest" href="./manifest.webmanifest">\n';
const startup = `<script>if('serviceWorker' in navigator&&location.protocol!=='file:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));}</script>\n`;
const page = html.toString('utf8').replace('</head>', pwa + '</head>').replace('</body>', startup + '</body>');
// Both static hosting from the checkout and hosting dist serve the complete app.
// Neither entry point needs the archive manifest or chunks at runtime.
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
fs.writeFileSync(path.join(output, 'index.html'), page);
for (const file of ['manifest.webmanifest', 'icon.svg', 'sw.js']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
// Remove archive copies left behind by the previous build format.
for (const file of ['archive.json', ...fs.readdirSync(output).filter(file => /^app-.*\.b64$/.test(file))]) {
  fs.rmSync(path.join(output, file), { force: true });
}
console.log(`Built Barkaloo: ${html.length} bytes (SHA-256 verified)`);
