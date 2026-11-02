(function (root) {
  'use strict';
  const SESSION = 'barkaloo_cloud_session_v1';
  const OWNER = 'barkaloo_sync_owner_v2';
  const BACKUP = 'barkaloo_before_cloud_v2';
  const ORIGINAL = 'barkaloo_first_cloud_backup_v2';
  const fields = ['words', 'stats', 'units', 'studyDays', 'coreProgress', 'coreBank', 'settings'];
  const copy = value => JSON.parse(JSON.stringify(value));
  function state(value) {
    if (!value || !Array.isArray(value.words)) throw new Error('Некорректные данные в облаке');
    const result = {};
    for (const key of fields) result[key] = copy(value[key] || (key === 'words' || key === 'coreBank' ? [] : {}));
    // Match the app's word migration so reloads don't look like user edits.
    result.words = result.words.map(word => ({ ...word,
      productionHistory: Array.isArray(word.productionHistory) ? word.productionHistory : [],
      uses: word.uses == null ? (word.correct || 0) + (word.wrong || 0) : word.uses
    }));
    return result;
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const equal = (a, b) => canonical(state(a)) === canonical(state(b));

  class CloudSync {
    constructor(options) {
      Object.assign(this, options);
      this.fetch = options.fetch || root.fetch.bind(root);
      this.storage = options.storage || root.localStorage;
      this.online = options.online || (() => !root.navigator || root.navigator.onLine);
      this.session = this.stored(SESSION);
      if (!this.session?.user?.id || !this.session.access_token) this.session = null;
      this.generation = 0;
      this.base = this.session ? this.stored(this.baseKey()) : null;
      this.conflict = null;
      this.phase = 'local';
      this.message = 'Войдите в один аккаунт на телефоне и компьютере';
      this.running = null;
      this.refreshing = null;
      this.queued = false;
      this.applying = false;
    }
    stored(key) {
      try { return JSON.parse(this.storage.getItem(key) || 'null'); } catch { return null; }
    }
    baseKey() { return 'barkaloo_sync_base_v2:' + this.session.user.id; }
    notify(phase, message) {
      this.phase = phase;
      this.message = message;
      this.onChange?.({ phase, message, session: this.session, conflict: this.conflict,
        hasBackup: !!this.stored(BACKUP), hasOriginalBackup: !!this.stored(ORIGINAL) });
    }
    assertCurrent(generation) {
      if (generation !== this.generation || !this.session) {
        const error = new Error('Аккаунт изменился'); error.cancelled = true; throw error;
      }
    }
    async json(path, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await this.fetch(this.url + path, {
          ...options, signal: controller.signal,
          headers: { apikey: this.key, 'Content-Type': 'application/json', ...options.headers }
        });
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!response.ok) {
          const error = new Error(data?.msg || data?.message || data?.error_description || `Ошибка облака: HTTP ${response.status}`);
          error.status = response.status;
          error.code = data?.code;
          throw error;
        }
        return data;
      } finally { clearTimeout(timeout); }
    }
    async ensureSession(force = false) {
      if (!this.session) throw new Error('Войдите в аккаунт');
      const expiration = this.session.expires_at ? this.session.expires_at * 1000 : (this.session.received_at || 0) + (this.session.expires_in || 3600) * 1000;
      if (!force && Date.now() < expiration - 60000) return;
      if (this.refreshing) return this.refreshing;
      const generation = this.generation;
      const previous = this.session;
      this.refreshing = (async () => {
        try {
          if (!previous.refresh_token) throw Object.assign(new Error('Войдите в аккаунт снова'), { status: 401 });
          const data = await this.json('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', body: JSON.stringify({ refresh_token: previous.refresh_token })
          });
          this.assertCurrent(generation);
          if (!data?.access_token) throw new Error('Не удалось обновить вход');
          this.session = { ...data, user: data.user || previous.user, received_at: Date.now() };
          this.storage.setItem(SESSION, JSON.stringify(this.session));
        } catch (error) {
          if (generation === this.generation && (error.status === 400 || error.status === 401)) {
            this.generation++;
            this.session = null;
            this.storage.removeItem(SESSION);
            error.message = 'Сессия истекла. Войдите снова — локальный прогресс сохранён';
          }
          throw error;
        }
      })().finally(() => { this.refreshing = null; });
      return this.refreshing;
    }
    async request(path, options = {}) {
      const generation = this.generation;
      await this.ensureSession();
      this.assertCurrent(generation);
      const send = () => this.json(path, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + this.session.access_token } });
      let result;
      try { result = await send(); }
      catch (error) {
        if (error.status !== 401) throw error;
        await this.ensureSession(true);
        this.assertCurrent(generation);
        result = await send();
      }
      this.assertCurrent(generation);
      return result;
    }
    async signIn(email, password) {
      const generation = this.generation;
      const data = await this.json('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (generation !== this.generation) return;
      await this.connect(data);
    }
    async signUp(email, password) {
      const generation = this.generation;
      const data = await this.json('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (generation !== this.generation) return;
      if (data?.access_token) await this.connect(data);
      else this.notify('confirm', 'Подтвердите почту по ссылке из письма, затем войдите');
    }
    async connect(data) {
      if (!data?.access_token || !data.user?.id) throw new Error('Не удалось войти в аккаунт');
      this.generation++;
      this.session = { ...data, received_at: Date.now() };
      this.storage.setItem(SESSION, JSON.stringify(this.session));
      this.base = this.stored(this.baseKey());
      this.conflict = null;
      await this.sync();
    }
    async signOut() {
      const token = this.session?.access_token;
      this.generation++;
      clearTimeout(this.timer);
      this.session = null;
      this.base = null;
      this.conflict = null;
      this.queued = false;
      this.storage.removeItem(SESSION);
      this.notify('local', 'Вы вышли. Данные остаются на этом устройстве');
      if (token) {
        try { await this.json('/auth/v1/logout?scope=local', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch { /* Local sign-out remains effective offline. */ }
      }
    }
    changed() {
      if (this.applying || !this.session || this.conflict) return;
      this.notify('pending', this.online() ? 'Изменения сохранены на устройстве. Синхронизация…' : 'Нет сети. Прогресс сохранён на устройстве');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.sync(), 700);
    }
    async fetchRow() {
      const rows = await this.request('/rest/v1/app_state?user_id=eq.' + encodeURIComponent(this.session.user.id) + '&select=state,updated_at');
      if (!Array.isArray(rows)) throw new Error('Некорректный ответ облака');
      if (rows[0]) state(rows[0].state);
      return rows[0] || null;
    }
    remember(row) {
      this.base = { state: state(row.state), updated_at: row.updated_at };
      this.storage.setItem(this.baseKey(), JSON.stringify(this.base));
      this.storage.setItem(OWNER, this.session.user.id);
    }
    backup() {
      const data = { savedAt: new Date().toISOString(), state: state(this.read()) };
      if (!this.stored(ORIGINAL)) this.storage.setItem(ORIGINAL, JSON.stringify(this.stored(BACKUP) || data));
      this.storage.setItem(BACKUP, JSON.stringify(data));
      return data;
    }
    async pull(row) {
      const generation = this.generation;
      this.backup();
      this.applying = true;
      try { await this.apply(copy(row.state)); }
      finally { this.applying = false; }
      this.assertCurrent(generation);
      this.remember(row);
      this.conflict = null;
      this.notify('synced', 'Прогресс загружен из облака');
    }
    showConflict(row, reason = 'changed') {
      this.conflict = { row, reason };
      this.notify('conflict', reason === 'account'
        ? 'На устройстве данные другого аккаунта. Перенести их в новый аккаунт?'
        : 'На двух устройствах есть изменения. Выберите, какую версию сохранить');
    }
    async push(snapshot, row) {
      const user = this.session.user.id;
      const timestamp = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
      const update = row
        ? '/rest/v1/app_state?user_id=eq.' + encodeURIComponent(user) + '&updated_at=eq.' + encodeURIComponent(row.updated_at)
        : '/rest/v1/app_state?on_conflict=user_id';
      const rows = await this.request(update, {
        method: row ? 'PATCH' : 'POST',
        headers: { Prefer: row ? 'return=representation' : 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(row ? { state: snapshot, updated_at: timestamp } : { user_id: user, state: snapshot, updated_at: timestamp })
      });
      if (!Array.isArray(rows) || !rows.length) {
        this.showConflict(await this.fetchRow());
        return;
      }
      this.remember(rows[0]);
      this.conflict = null;
      // Changes made while the request was in flight must be sent in another pass.
      if (!equal(this.read(), snapshot)) {
        this.queued = true;
        this.notify('pending', 'Отправляются новые изменения…');
      } else this.notify('synced', 'Синхронизировано в ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    async reconcile(choice) {
      const row = await this.fetchRow();
      const local = state(this.read());
      if (choice === 'cloud') {
        if (!row) { this.showConflict(null); return; }
        await this.pull(row);
        return;
      }
      if (choice === 'local') { this.backup(); await this.push(local, row); return; }
      if (this.conflict) return;
      if (!this.base) {
        if (row) { await this.pull(row); return; }
        const owner = this.storage.getItem(OWNER);
        if (owner && owner !== this.session.user.id) { this.showConflict(null, 'account'); return; }
        await this.push(local, null);
        return;
      }
      if (!row) { this.showConflict(null); return; }
      const localChanged = !equal(local, this.base.state);
      const remoteChanged = !equal(row.state, this.base.state);
      if (equal(local, row.state)) {
        this.remember(row);
        this.notify('synced', 'Прогресс на устройствах совпадает');
      } else if (localChanged && remoteChanged) this.showConflict(row);
      else if (localChanged) await this.push(local, row);
      else await this.pull(row);
    }
    sync(choice) {
      if (!this.session) { this.notify('local', this.message); return Promise.resolve(); }
      if (this.conflict && !choice) return Promise.resolve();
      if (this.running) { this.queued = true; return this.running; }
      if (!this.online()) { this.notify('offline', 'Нет сети. Прогресс сохранён на устройстве'); return Promise.resolve(); }
      this.notify('syncing', 'Синхронизация…');
      const generation = this.generation;
      this.running = this.reconcile(choice).catch(error => {
        if (error.cancelled || generation !== this.generation && this.session) return;
        this.notify('error', error.code === 'PGRST205' || error.status === 404
          ? 'Хранилище синхронизации ещё не настроено. Локальный прогресс сохранён'
          : 'Не удалось синхронизировать: ' + error.message);
      }).finally(() => {
        this.running = null;
        if (this.queued && this.session && !this.conflict) {
          this.queued = false;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.sync(), 100);
        }
      });
      return this.running;
    }
    downloadBackup(original = false) {
      const saved = this.stored(original ? ORIGINAL : BACKUP);
      if (!saved) return;
      const blob = new Blob([JSON.stringify(saved.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = original ? 'barkaloo-first-device-backup.json' : 'barkaloo-before-sync.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    dispose() {
      clearTimeout(this.timer);
      this.queued = false;
      this.generation++;
      this.onChange = null;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { CloudSync, state, equal };
  else root.BarkalooCloud = CloudSync;
})(typeof globalThis === 'undefined' ? window : globalThis);
