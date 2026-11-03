const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readArchive } = require('./archive.cjs');

test('archive restores every byte of the editable HTML source, including inline scripts', () => {
  const { html } = readArchive();
  assert.deepEqual(html, fs.readFileSync(path.join(__dirname, 'source/app.html')));
});

test('a damaged chunk and a wrong HTML checksum are rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barkaloo-archive-'));
  try {
    const { manifest } = readArchive();
    for (const file of ['archive.json', ...manifest.files]) {
      fs.copyFileSync(path.join(__dirname, file), path.join(root, file));
    }
    const file = path.join(root, manifest.files[0]);
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, (original[0] === 'A' ? 'B' : 'A') + original.slice(1));
    assert.throws(() => readArchive(root), /Archive SHA-256 mismatch/);
    fs.writeFileSync(file, original);
    fs.writeFileSync(path.join(root, 'archive.json'), JSON.stringify({ ...manifest, htmlSha256: '0'.repeat(64) }));
    assert.throws(() => readArchive(root), /HTML SHA-256 mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('build works outside the checkout and contains the original scripts and PWA assets', () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.cjs')], { cwd: os.tmpdir() });
  const dist = path.join(__dirname, 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, 'source/app.html'), 'utf8');
  for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    assert.ok(html.includes(match[0]), 'original application script was changed');
  }
  assert.ok(html.includes('data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'source/logo-character.png')).toString('base64')));
  assert.ok(!html.includes('__BARKALOO_CHARACTER_LOGO__'));
  assert.match(html, /rel="manifest"/);
  assert.match(html, /serviceWorker\.register/);
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, 'source/cloud-sync.js'), 'utf8')));
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, 'source/cloud-ui.js'), 'utf8')));
  assert.ok(!html.includes('<!-- BARKALOO_CLOUD_'));
  assert.equal(html, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
  assert.ok(!html.includes('archive.json'), 'browser must not need an archive manifest');
  assert.ok(!fs.existsSync(path.join(dist, 'archive.json')));
  assert.ok(!fs.readdirSync(dist).some(file => file.endsWith('.b64')));
  for (const file of ['sw.js', 'manifest.webmanifest', 'icon.svg']) {
    assert.deepEqual(fs.readFileSync(path.join(dist, file)), fs.readFileSync(path.join(__dirname, file)));
  }
});
