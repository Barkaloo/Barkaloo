const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const { sha256 } = require('./archive.cjs');

const html = fs.readFileSync(path.join(__dirname, 'source/app.html'));
const gzip = gzipSync(html, { level: 9 });
if (!gunzipSync(gzip).equals(html)) throw new Error('Archive round-trip failed');
const encoded = gzip.toString('base64');
const files = [...Array.from({ length: 11 }, (_, i) => `app-${String(i).padStart(2, '0')}.b64`), 'app-tail.b64'];
const chunkSize = Math.ceil(encoded.length / files.length / 4) * 4;
files.forEach((file, i) => fs.writeFileSync(path.join(__dirname, file),
  encoded.slice(i * chunkSize, (i + 1) * chunkSize) + '\n'));
fs.writeFileSync(path.join(__dirname, 'archive.json'), JSON.stringify({
  files, htmlBytes: html.length, htmlSha256: sha256(html), gzipSha256: sha256(gzip)
}, null, 2) + '\n');
console.log(`Packed Barkaloo: ${html.length} HTML bytes, ${gzip.length} gzip bytes`);
