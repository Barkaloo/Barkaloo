const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CloudSync, state, equal } = require('./source/cloud-sync.js');

const clone = value => JSON.parse(JSON.stringify(value));
const sample = () => ({ words: [], stats: { verbCorrect: 0 }, units: {}, studyDays: {}, coreProgress: {}, coreBank: [], settings: {} });
const word = value => ({ id: value, word: value, translation: '', kind: 'active' });
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
}
const { backend } = require('./test/supabase-fake.cjs');

function device(t, server, options = {}) {
  const local = { value: sample(), online: true, ...options };
  const store = options.storage || storage();
  const client = new CloudSync({ url: 'https://backend.example.test', key: 'public-key', storage: store, fetch: server.fetch,
    read: () => clone(local.value), apply: value => { local.value = clone(value); }, online: () => local.online });
  t.after(() => client.dispose());
  return { client, local, store };
}
const login = d => d.client.signIn('person@example.test', 'test-password');

test('one account shares words, calendar, stats, grammar and settings across independent devices', async t => {
  const server = backend(); const a = device(t, server); const b = device(t, server);
  await login(a); await login(b);
  a.local.value = { ...sample(), words: [word('hello')], stats: { verbCorrect: 4 }, units: { 3: true }, studyDays: { '2026-11-03': true }, coreProgress: { hello: 'active' }, coreBank: [{ word: 'hello', translation: 'привет' }], settings: { autoSpeak: false } };
  a.client.changed(); await a.client.sync(); await b.client.sync();
  assert.ok(equal(a.local.value, b.local.value));
  b.local.value.words.push(word('phone')); await b.client.sync(); await a.client.sync();
  assert.equal(a.local.value.words[1].word, 'phone');
  assert.equal(a.client.phase, 'synced');
  assert.ok(![...a.store.data.values()].join('').includes('test-password'));
});

test('offline changes survive reload and upload on reconnect', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  a.local.online = false; a.local.value.words.push(word('offline')); a.client.changed(); await a.client.sync();
  assert.equal(server.rows.get('person').state.words.length, 0);
  a.client.dispose();
  const restored = device(t, server, { value: clone(a.local.value), storage: a.store });
  await restored.client.sync();
  assert.equal(server.rows.get('person').state.words[0].word, 'offline');
});

test('simultaneous edits are not overwritten; cloud choice preserves the local backup', async t => {
  const server = backend(); const a = device(t, server); const b = device(t, server);
  await login(a); await login(b);
  a.local.value.words.push(word('computer')); b.local.value.words.push(word('phone'));
  await a.client.sync(); await b.client.sync();
  assert.equal(b.client.phase, 'conflict');
  assert.equal(server.rows.get('person').state.words[0].word, 'computer');
  await b.client.sync('cloud');
  assert.equal(b.local.value.words[0].word, 'computer');
  assert.equal(JSON.parse(b.store.getItem('barkaloo_before_cloud_v2')).state.words[0].word, 'phone');
});

test('conditional write detects a change between fetching and uploading', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  a.local.value.words.push(word('local'));
  server.beforePatch = () => server.rows.set('person', { user_id: 'person', state: { ...sample(), words: [word('remote')] }, updated_at: '2099-01-01T00:00:00.000Z' });
  await a.client.sync();
  assert.equal(a.client.phase, 'conflict');
  assert.equal(server.rows.get('person').state.words[0].word, 'remote');
  await a.client.sync('local');
  assert.equal(server.rows.get('person').state.words[0].word, 'local');
});

test('expired access token refreshes and retries the request once', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  server.rejectToken = true;
  await a.client.sync();
  assert.equal(server.refreshes, 1);
  assert.equal(a.client.phase, 'synced');
});

test('new account cannot silently receive the previous account data', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  a.local.value.words.push(word('private')); await a.client.sync(); await a.client.signOut();
  await a.client.signIn('other@example.test', 'test-password');
  assert.equal(a.client.phase, 'conflict');
  assert.equal(a.client.conflict.reason, 'account');
  assert.ok(!server.rows.has('other'));
});

test('logout invalidates an in-flight pull and keeps local data intact', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  const original = a.client.fetch;
  let release;
  a.client.fetch = async (url, options) => {
    if (url.includes('/rest/')) await new Promise(resolve => { release = resolve; });
    return original(url, options);
  };
  const work = a.client.sync();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await a.client.signOut(); release(); await work;
  assert.equal(a.client.session, null);
  assert.equal(a.store.getItem('barkaloo_cloud_session_v1'), null);
  assert.equal(a.client.phase, 'local');
});

test('confirmation email and missing database are reported without a false synced status', async t => {
  const server = backend(); const a = device(t, server);
  server.confirmation = true;
  await a.client.signUp('person@example.test', 'test-password');
  assert.equal(a.client.phase, 'confirm'); assert.equal(a.client.session, null);
  server.missing = true; await login(a);
  assert.equal(a.client.phase, 'error'); assert.match(a.client.message, /не настроено/);
});

test('word migration after reload does not create a false conflict', async t => {
  const server = backend();
  server.rows.set('person', { user_id: 'person', state: { ...sample(), words: [word('old-format')] }, updated_at: new Date().toISOString() });
  const a = device(t, server); const b = device(t, server);
  b.client.apply = value => { b.local.value = clone(value); b.local.value.words.forEach(w => { w.productionHistory ||= []; w.uses ??= (w.correct || 0) + (w.wrong || 0); }); };
  await login(a); await login(b);
  a.local.value.words.push(word('new-format')); await a.client.sync(); await b.client.sync();
  assert.equal(b.client.phase, 'synced');
  assert.equal(b.local.value.words[1].word, 'new-format');
});

test('the first local backup survives subsequent cloud pulls', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  const b = device(t, server); b.local.value.words.push(word('original-local')); await login(b);
  a.local.value.words.push(word('cloud-update')); await a.client.sync(); await b.client.sync();
  assert.equal(JSON.parse(b.store.getItem('barkaloo_first_cloud_backup_v2')).state.words[0].word, 'original-local');
});

test('edits made during an upload remain pending until a subsequent upload', async t => {
  const server = backend(); const a = device(t, server); await login(a);
  a.local.value.words.push(word('first-edit'));
  server.beforePatch = () => { a.local.value.words.push(word('second-edit')); a.client.changed(); };
  await a.client.sync();
  assert.equal(a.client.phase, 'pending');
  assert.equal(server.rows.get('person').state.words.length, 1);
  await a.client.sync();
  assert.equal(a.client.phase, 'synced');
  assert.equal(server.rows.get('person').state.words.length, 2);
});
