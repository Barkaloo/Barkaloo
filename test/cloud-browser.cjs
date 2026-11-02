// Real browser and app code, with an explicitly simulated Supabase API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { backend } = require('./supabase-fake.cjs');
const root = path.resolve(__dirname, '../dist');
const key = fs.readFileSync(path.resolve(__dirname, '../source/cloud-ui.js'), 'utf8').match(/key: '([^']+)'/)[1];

async function main() {
  const api = backend(key);
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    const file = path.join(root, name === '/' ? 'index.html' : name);
    const extension = path.extname(file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', extension === '.js' ? 'application/javascript' : extension === '.html' ? 'text/html' : extension === '.svg' ? 'image/svg+xml' : 'application/json');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
    const errors = [];
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const context of [desktop, mobile]) {
      await context.route('https://*.supabase.co/**', async route => {
        const request = route.request();
        const headers = request.headers();
        const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
        if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
        const result = await api.fetch(request.url(), { method: request.method(), body: request.postData(), headers: { ...headers, Authorization: headers.authorization } });
        await route.fulfill({ status: result.status, contentType: 'application/json', headers: cors, body: await result.text() });
      });
    }
    const a = await desktop.newPage(); const b = await mobile.newPage();
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
    const phase = async (page, expected) => {
      try { await page.waitForFunction(value => cloudSyncClient.phase === value, expected); }
      catch (error) {
        console.error('Sync failure:', await page.evaluate(() => {
          const local = cloudSyncClient.read(), base = cloudSyncClient.base?.state || {};
          return { phase: cloudSyncClient.phase, message: cloudSyncClient.message,
            changedFields: Object.keys(base).filter(key => JSON.stringify(local[key]) !== JSON.stringify(base[key])) };
        }));
        throw error;
      }
    };
    async function navigate(page, title) {
      const button = page.getByRole('button', { name: title, exact: true });
      const bounds = await button.boundingBox();
      if (!bounds || bounds.x < 0 || bounds.x + bounds.width > page.viewportSize().width) await page.locator('#burger').click();
      await button.click();
    }
    async function login(page) {
      await page.goto(origin);
      await page.locator('#cloudEmail').fill('person@example.test');
      await page.locator('#cloudPassword').fill('test-password');
      await page.locator('#cloudSignIn').click();
      await phase(page, 'synced');
      assert.equal(await page.locator('#cloudAuthForm').isVisible(), false);
      assert.equal(await page.locator('#cloudLoggedIn').isVisible(), true);
    }
    async function add(page, word) {
      await navigate(page, 'Dictionary');
      await page.locator('#dictKinds [data-kind="active"]').click();
      await page.locator('#wordInput').fill(word);
      await page.locator('#translationInput').fill('проверка');
      await page.locator('#addWordBtn').click();
    }
    async function expectWord(page, word) {
      await navigate(page, 'Dictionary');
      await page.locator('#dictKinds [data-kind="active"]').click();
      await page.locator('#dictSearch').fill(word);
      assert.match(await page.locator('#dictList').innerText(), new RegExp(word));
    }
    async function sync(page) {
      await navigate(page, 'Home');
      await page.locator('#cloudSyncNow').click();
      await phase(page, 'synced');
    }
    await login(a); await add(a, 'sync-computer'); await phase(a, 'synced');
    await login(b); await expectWord(b, 'sync-computer');
    await add(b, 'sync-phone'); await phase(b, 'synced'); await sync(a); await expectWord(a, 'sync-phone');
    console.log('PASS: desktop and mobile exchange real UI changes through the simulated API');

    await b.evaluate(() => navigator.serviceWorker.ready);
    await b.waitForFunction(() => !!navigator.serviceWorker.controller);
    await mobile.setOffline(true); await add(b, 'sync-offline');
    await b.reload(); await b.locator('#home.active').waitFor();
    await mobile.setOffline(false); await phase(b, 'synced'); await sync(a); await expectWord(a, 'sync-offline');
    console.log('PASS: offline edits survive reload and synchronize after reconnecting');

    await desktop.setOffline(true); await mobile.setOffline(true);
    await add(a, 'sync-pc-conflict'); await add(b, 'sync-phone-conflict');
    await desktop.setOffline(false); await phase(a, 'synced');
    await mobile.setOffline(false); await phase(b, 'conflict');
    assert.ok(!api.rows.get('person').state.words.some(word => word.word === 'sync-phone-conflict'));
    await navigate(b, 'Home'); await b.locator('#cloudUseCloud').click(); await phase(b, 'synced');
    assert.ok(await b.evaluate(() => JSON.parse(localStorage.getItem('barkaloo_before_cloud_v2')).state.words.some(word => word.word === 'sync-phone-conflict')));
    await expectWord(b, 'sync-pc-conflict');
    console.log('PASS: conflicts require a choice and preserve the local backup');

    await navigate(b, 'Home'); await b.locator('#cloudSignOut').click();
    assert.equal(await b.locator('#cloudAuthForm').isVisible(), true);
    assert.equal(await b.locator('#cloudLoggedIn').isVisible(), false);
    assert.equal(await b.locator('#cloudPassword').inputValue(), '');
    assert.deepEqual(errors, []);
    console.log('PASS: logout, mobile UI and no JavaScript exceptions');
    await desktop.close(); await mobile.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
