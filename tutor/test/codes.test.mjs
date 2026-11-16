import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  generateCode,
  fingerprint,
  encryptCode,
  decryptCode,
} from "../../supabase/functions/tutor-student-access/credentials.ts";

test("Student credentials: encryption, leading zeroes and tamper protection", async () => {
  const secret = randomUUID() + randomUUID(),
    other = randomUUID();
  const a = await encryptCode(secret, "001234"),
    b = await encryptCode(secret, "001234");
  assert.notEqual(a, b);
  assert.equal(await decryptCode(secret, a), "001234");
  await assert.rejects(decryptCode(other, a));
  await assert.rejects(decryptCode(secret, a.slice(0, -4) + "AAAA"));
  assert.notEqual(
    await fingerprint(secret, "code", "001234"),
    await fingerprint(other, "code", "001234"),
  );
  assert.notEqual(
    await fingerprint(secret, "code", "001234"),
    await fingerprint(secret, "network", "001234"),
  );
  for (let i = 0; i < 30; i++) assert.match(generateCode(), /^\d{6}$/);
});

test("Real PostgreSQL: permanent codes, role isolation, session registration, rotation, suspension and throttling", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default clock_timestamp(),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    create function storage.extension(name text) returns text language sql as $$ select (string_to_array(name,'.'))[array_length(string_to_array(name,'.'),1)] $$;`);
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(migrations))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(f, migrations), "utf8"));
  const owner = randomUUID(),
    secondTeacher = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, secondTeacher, outsider])
    await db.query("insert into auth.users values($1,$2)", [
      id,
      `${id}@test.invalid`,
    ]);
  await db.query(
    "insert into tutor_roles values($1,'teacher'),($2,'teacher')",
    [owner, secondTeacher],
  );
  const as = async (id, session) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: id, session_id: session }),
    ]);
    await db.exec("set role authenticated");
  };
  const service = () => db.exec("reset role;set role service_role");
  const gateway = async (action, p = {}) =>
    (
      await db.query("select tutor_code_gateway($1,$2::jsonb) as value", [
        action,
        JSON.stringify(p),
      ])
    ).rows[0].value;
  const api = async (action, p = {}) =>
    (
      await db.query("select tutor_api($1,$2::jsonb) as value", [
        action,
        JSON.stringify(p),
      ])
    ).rows[0].value;
  await as(owner);
  await api("data");
  await assert.rejects(gateway("config"), /permission denied/);
  await assert.rejects(
    db.exec("select * from tutor_private.code_config"),
    /permission denied/,
  );
  await service();
  const secret = (await gateway("config")).secret;
  const requestId = randomUUID(),
    prepared = await gateway("prepare", {
      actor_id: owner,
      request_id: requestId,
    }),
    sid = prepared.student_id;
  assert.equal(
    (await gateway("prepare", { actor_id: owner, request_id: requestId }))
      .student_id,
    sid,
  );
  await assert.rejects(
    gateway("prepare", { actor_id: secondTeacher, request_id: requestId }),
    /недоступен/,
  );
  await assert.rejects(
    gateway("prepare", { actor_id: outsider, request_id: randomUUID() }),
    /преподавателя/,
  );
  await db.exec("reset role");
  await db.query("insert into auth.users values($1,$2)", [
    sid,
    `${sid}@test.invalid`,
  ]);
  await service();
  const hash = await fingerprint(secret, "code", "001234"),
    cipher = await encryptCode(secret, "001234");
  const saved = await gateway("finish", {
    actor_id: owner,
    request_id: requestId,
    student_id: sid,
    nickname: "",
    code_hash: hash,
    ciphertext: cipher,
  });
  assert.equal(await decryptCode(secret, saved.ciphertext), "001234");
  assert.equal(
    (
      await gateway("finish", {
        actor_id: owner,
        request_id: requestId,
        student_id: sid,
        code_hash: "b".repeat(64),
        ciphertext: "not a replacement",
      })
    ).ciphertext,
    cipher,
  );
  await assert.rejects(
    gateway("show", { actor_id: secondTeacher, student_id: sid }),
    /недоступен/,
  );
  await as(sid);
  await assert.rejects(api("data"), /код обновлён/);
  assert.equal((await db.query("select * from tutor_sections")).rows.length, 0);
  await assert.rejects(
    gateway("show", { actor_id: owner, student_id: sid }),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select tutor_private.api_v2('data','{}')"),
    /permission denied/,
  );
  const network = await fingerprint(secret, "network", "192.0.2.1");
  const startSession = async (hash) => {
    await service();
    const claim = await gateway("login", {
      code_hash: hash,
      network_hash: network,
    });
    assert.equal(claim.allowed, true);
    const id = randomUUID();
    await db.exec("reset role");
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      id,
      sid,
    ]);
    await service();
    assert.equal(
      (
        await gateway("confirm", {
          student_id: sid,
          code_hash: hash,
          version: claim.version,
          session_id: id,
        })
      ).allowed,
      true,
    );
    await as(sid, id);
    return id;
  };
  const first = await startSession(hash);
  let data = await api("data");
  assert.equal(data.profile.onboarding_complete, false);
  assert.equal(data.role, "student");
  assert.equal(JSON.stringify(data).includes(cipher), false);
  assert.equal(JSON.stringify(data).includes(hash), false);
  await assert.rejects(
    api("student_setup", { display_name: "a" }),
    /от 2 до 60/,
  );
  await api("student_setup", {
    display_name: "Ученик с кодом",
    theme: "light",
  });
  data = await api("data");
  assert.equal(data.profile.onboarding_complete, true);
  assert.equal(data.profile.display_name, "Ученик с кодом");
  assert.equal(data.profile.theme, "light");
  // The same permanent code creates another valid session without a new account.
  const second = await startSession(hash);
  assert.notEqual(first, second);
  assert.equal((await api("data")).profile.user_id, sid);
  await as(owner);
  data = await api("data");
  assert.equal(data.students[0].login_method, "code");
  assert.equal(data.students[0].display_name, "Ученик с кодом");
  await service();
  assert.equal(
    (
      await gateway("rotate", {
        actor_id: owner,
        student_id: sid,
        version: 1,
        code_hash: hash,
        ciphertext: cipher,
      })
    ).collision,
    true,
  );
  const newHash = await fingerprint(secret, "code", "009876"),
    newCipher = await encryptCode(secret, "009876");
  const rotated = await gateway("rotate", {
    actor_id: owner,
    student_id: sid,
    version: 1,
    code_hash: newHash,
    ciphertext: newCipher,
  });
  assert.equal(rotated.version, 2);
  assert.equal(
    (await gateway("login", { code_hash: hash, network_hash: network }))
      .allowed,
    false,
  );
  await as(sid, second);
  await assert.rejects(api("data"), /код обновлён/);
  assert.equal((await db.query("select * from tutor_profiles")).rows.length, 0);
  // A refreshed JWT with the same old session_id still cannot gain access.
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: sid, session_id: second, iat: 9999999999 }),
  ]);
  await assert.rejects(api("data"), /код обновлён/);
  await db.exec("reset role");
  await db.exec("delete from tutor_private.code_limits");
  const third = await startSession(newHash);
  assert.equal((await api("data")).profile.display_name, "Ученик с кодом");
  await service();
  const suspended = await gateway("enabled", {
    actor_id: owner,
    student_id: sid,
    enabled: false,
  });
  assert.equal(suspended.enabled, false);
  await as(sid, third);
  await assert.rejects(api("data"), /код обновлён/);
  await service();
  assert.equal(
    (await gateway("login", { code_hash: newHash, network_hash: network }))
      .allowed,
    false,
  );
  await gateway("enabled", { actor_id: owner, student_id: sid, enabled: true });
  const fourth = await startSession(newHash);
  assert.equal((await api("data")).profile.user_id, sid);
  await as(owner);
  await api("student_save", {
    student_id: sid,
    nickname: "",
    started_on: "2026-11-01",
    status: "archived",
    notes: "",
  });
  await as(sid, fourth);
  await assert.rejects(api("data"), /код обновлён/);
  await as(owner);
  await api("student_save", {
    student_id: sid,
    nickname: "",
    started_on: "2026-11-01",
    status: "active",
    notes: "",
  });
  await as(sid, fourth);
  await assert.rejects(api("data"), /код обновлён/);
  await db.exec("reset role");
  await db.exec("delete from tutor_private.code_limits");
  await service();
  const unknown = "f".repeat(64);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await gateway("login", { code_hash: unknown, network_hash: network }))
        .allowed,
      false,
    );
  assert.ok(
    (await gateway("login", { code_hash: unknown, network_hash: network }))
      .retry_after > 0,
  );
  await db.exec("reset role");
  await db.exec("delete from tutor_private.code_limits");
  await service();
  for (let i = 0; i < 60; i++)
    assert.equal(
      (
        await gateway("login", {
          code_hash: i.toString(16).padStart(64, "0"),
          network_hash: (i + 100).toString(16).padStart(64, "0"),
        })
      ).retry_after,
      undefined,
    );
  assert.ok(
    (await gateway("login", { code_hash: unknown, network_hash: network }))
      .retry_after > 0,
  );
});
