import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createTabAuth } from "../src/lib/tab-auth.ts";

function tabStorage(seed = []) {
  const values = new Map(seed);
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    entries: () => [...values.entries()],
  };
}

test("Tab auth retains reloads but clears copied credentials on fresh navigation", () => {
  const original = tabStorage();
  const first = createTabAuth("project", original, "navigate", "document-a");
  first.storage.setItem(first.storageKey, "teacher-session");
  first.storage.setItem(first.storageKey + "-code-verifier-flow", "verifier");
  original.setItem("other-project", "untouched");
  original.setItem("barkaloo-tutor-preview", "true");
  const copied = tabStorage(original.entries());
  const second = createTabAuth("project", copied, "navigate", "document-b");
  assert.equal(second.storage.getItem(second.storageKey), null);
  assert.equal(copied.getItem("project-tab-code-verifier-flow"), null);
  assert.equal(copied.getItem("barkaloo-tutor-preview"), null);
  assert.equal(copied.getItem("other-project"), "untouched");
  assert.equal(first.storage.getItem(first.storageKey), "teacher-session");
  const reloaded = createTabAuth(
    "project",
    original,
    "reload",
    "document-a-reload",
  );
  assert.notEqual(reloaded.storageKey, first.storageKey);
  assert.equal(
    reloaded.storage.getItem(reloaded.storageKey),
    "teacher-session",
  );
  assert.equal(
    reloaded.storage.getItem(reloaded.storageKey + "-code-verifier-flow"),
    "verifier",
  );
  const restoredCopy = tabStorage(original.entries());
  const restored = createTabAuth(
    "project",
    restoredCopy,
    "back_forward",
    "document-back",
  );
  assert.equal(restored.storage.getItem(restored.storageKey), null);
  assert.equal(first.storage.getItem(first.storageKey), "teacher-session");
});

test("Tab auth has isolated in-memory storage when browser storage is unavailable", () => {
  const a = createTabAuth("project", undefined, "navigate", "a");
  const b = createTabAuth("project", undefined, "navigate", "b");
  a.storage.setItem(a.storageKey, "a-only");
  assert.equal(b.storage.getItem(b.storageKey), null);
  assert.throws(() => a.storage.getItem("other-project"), /Unexpected/);
  a.storage.removeItem(a.storageKey);
  assert.equal(a.storage.getItem(a.storageKey), null);
});

test("Real Supabase SDK isolates sign-in, refresh, reload and local sign-out across tabs", async (t) => {
  // Local HTTP responses only. No live accounts, keys or production requests.
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    location: { href: "https://local.test/tutor/" },
  };
  globalThis.document = { visibilityState: "hidden" };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const eventsA = [],
    eventsB = [],
    logouts = [];
  let sequence = 0;
  const refreshOwners = new Map();
  const jwt = (id) =>
    `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, session_id: id + "-session" })).toString("base64url")}.local-test-signature`;
  const session = (id) => {
    const refresh_token = id + "-refresh-" + ++sequence;
    refreshOwners.set(refresh_token, id);
    return {
      access_token: jwt(id),
      refresh_token,
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: id + "@test.invalid",
        created_at: "2026-01-01T00:00:00Z",
        app_metadata: {},
        user_metadata: {},
      },
    };
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(input),
      body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    if (url.pathname.endsWith("/logout")) {
      logouts.push(url.searchParams.get("scope"));
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/token")) {
      const id =
        url.searchParams.get("grant_type") === "refresh_token"
          ? refreshOwners.get(body.refresh_token)
          : body.email.split("@")[0];
      assert.ok(id, "Refresh belongs to this mock Auth service");
      return Response.json(session(id));
    }
    throw Error("Unexpected mock request: " + url.pathname);
  };
  const clients = [];
  t.after(() => clients.forEach((client) => client.auth.dispose()));
  const create = (options) => {
    const client = createClient(
      "https://local.test",
      "local-publishable-test-key",
      {
        global: { fetch },
        auth: {
          ...options,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    clients.push(client);
    return client;
  };
  const storageA = tabStorage(),
    storageB = tabStorage();
  const a = create(
    createTabAuth("test-project", storageA, "navigate", "tab-a"),
  );
  const b = create(
    createTabAuth("test-project", storageB, "navigate", "tab-b"),
  );
  a.auth.onAuthStateChange((event, s) => eventsA.push([event, s?.user.id]));
  b.auth.onAuthStateChange((event, s) => eventsB.push([event, s?.user.id]));
  assert.equal(
    (
      await a.auth.signInWithPassword({
        email: "teacher@test.invalid",
        password: "local-test-only",
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await b.auth.signInWithPassword({
        email: "student@test.invalid",
        password: "local-test-only",
      })
    ).error,
    null,
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal((await a.auth.getSession()).data.session.user.id, "teacher");
  assert.equal((await b.auth.getSession()).data.session.user.id, "student");
  assert.ok(eventsA.every(([, id]) => !id || id === "teacher"));
  assert.ok(eventsB.every(([, id]) => !id || id === "student"));
  const teacherToken = (await a.auth.getSession()).data.session.refresh_token;
  assert.equal((await b.auth.refreshSession()).error, null);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(
    (await a.auth.getSession()).data.session.refresh_token,
    teacherToken,
  );
  assert.ok(eventsA.every(([, id]) => !id || id === "teacher"));
  assert.equal((await b.auth.signOut({ scope: "local" })).error, null);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal((await b.auth.getSession()).data.session, null);
  assert.equal((await a.auth.getSession()).data.session.user.id, "teacher");
  assert.deepEqual(logouts, ["local"]);
  a.auth.dispose();
  const reloaded = create(
    createTabAuth("test-project", storageA, "reload", "tab-a-reloaded"),
  );
  assert.equal(
    (await reloaded.auth.getSession()).data.session.user.id,
    "teacher",
  );
});
