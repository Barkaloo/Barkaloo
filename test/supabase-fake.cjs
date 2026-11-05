const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
function backend(expectedKey = 'public-key') {
  const rows = new Map();
  const calls = [];
  const server = { rows, calls, refreshes: 0, beforePatch: null, rejectToken: false, confirmation: false, missing: false, resends: 0, emailError: null };
  let revision = Date.now();
  const response = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status });
  const session = id => ({ access_token: 'token-' + id, refresh_token: 'refresh-' + id, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: id + '@example.test' } });
  server.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, method: options.method || 'GET' });
    assert.equal(options.headers.apikey, expectedKey);
    if (url.pathname.endsWith('/resend')) {
      server.resends++;
      if (server.emailError) return response({message:server.emailError.message,error_code:server.emailError.code},server.emailError.status);
      assert.equal(body.type,'signup');return response({});
    }
    if (url.pathname.endsWith('/user')) {
      const token=options.headers.Authorization||'';
      if(!token.startsWith('Bearer token-'))return response({message:'Invalid token'},401);
      return response(session(token.slice('Bearer token-'.length)).user);
    }
    if (url.pathname.endsWith('/token') || url.pathname.endsWith('/signup')) {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        server.refreshes++; server.rejectToken = false;
        return response(session(body.refresh_token.slice('refresh-'.length)));
      }
      if (body.password !== 'test-password') return response({ msg: 'Invalid credentials' }, 400);
      if (url.pathname.endsWith('/signup') && server.confirmation) return response({ user: { id: body.email.split('@')[0] } });
      return response(session(body.email.split('@')[0]));
    }
    if (url.pathname.endsWith('/logout')) {
      assert.equal(url.searchParams.get('scope'), 'local');
      return response(null, 204);
    }
    if (server.missing) return response({ code: 'PGRST205', message: 'Table not found' }, 404);
    if (server.rejectToken) return response({ message: 'Expired token' }, 401);
    const token = options.headers.Authorization || '';
    if (!token.startsWith('Bearer token-')) return response({}, 401);
    const id = token.slice('Bearer token-'.length);
    const filter = url.searchParams.get('user_id');
    if (filter && filter !== 'eq.' + id || body?.user_id && body.user_id !== id) return response({}, 403);
    if (options.method === 'PATCH') {
      if (server.beforePatch) { const hook = server.beforePatch; server.beforePatch = null; await hook(); }
      const current = rows.get(id);
      if (!current || url.searchParams.get('updated_at') !== 'eq.' + current.updated_at) return response([]);
      const row = { user_id: id, state: clone(body.state), updated_at: new Date(++revision).toISOString() };
      rows.set(id, row); return response([row]);
    }
    if (options.method === 'POST') {
      if (rows.has(id)) return response([]);
      const row = { user_id: id, state: clone(body.state), updated_at: new Date(++revision).toISOString() };
      rows.set(id, row); return response([row]);
    }
    return response(rows.has(id) ? [rows.get(id)] : []);
  };
  return server;
}
module.exports = { backend };
