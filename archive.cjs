const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function readArchive(root = __dirname) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'archive.json'), 'utf8'));
  const encoded = manifest.files.map(file =>
    fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+/g, '')).join('');
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Invalid base64 archive');
  }
  const gzip = Buffer.from(encoded, 'base64');
  if (sha256(gzip) !== manifest.gzipSha256) throw new Error('Archive SHA-256 mismatch');
  const html = gunzipSync(gzip);
  if (html.length !== manifest.htmlBytes || sha256(html) !== manifest.htmlSha256) {
    throw new Error('HTML SHA-256 mismatch');
  }
  if (!html.toString('utf8').trimStart().toLowerCase().startsWith('<!doctype html')) {
    throw new Error('Archive did not unpack to HTML');
  }
  return { html, manifest };
}

module.exports = { readArchive, sha256 };
