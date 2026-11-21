import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("Teaching: invitations, private access, immutable homework, review, lessons and isolation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default clock_timestamp(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
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
    otherTeacher = randomUUID(),
    student = randomUUID(),
    stranger = randomUUID();
  for (const id of [owner, otherTeacher, student, stranger])
    await db.query("insert into auth.users values($1,$2)", [
      id,
      `${id}@test.invalid`,
    ]);
  await db.query(
    "insert into tutor_roles values($1,'teacher'),($2,'teacher')",
    [owner, otherTeacher],
  );
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const api = async (action, p = {}) =>
    (
      await db.query("select tutor_api($1,$2::jsonb) as value", [
        action,
        JSON.stringify(p),
      ])
    ).rows[0].value;
  const data = async (preview = false) => api("data", { preview });
  await as(owner);
  await data();
  const invite = await api("invite_create", { label: "Integration fixture" });
  assert.match(invite.code, /^[\da-f-]{36}$/);
  assert.equal(invite.token_hash, undefined);
  assert.equal(
    JSON.stringify((await data()).invites).includes(invite.code),
    false,
  );
  const expired = await api("invite_create", { label: "Expired fixture" });
  const revoked = await api("invite_create", { label: "Revoked fixture" });
  await api("invite_revoke", { id: revoked.id });
  await db.exec("reset role");
  await db.query(
    "update tutor_private.student_invites set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await as(student);
  await assert.rejects(api("student_join", { code: expired.code }), /срок истёк/);
  await assert.rejects(api("student_join", { code: revoked.code }), /недоступно/);
  await data();
  await api("student_join", { code: invite.code });
  await api("student_join", { code: invite.code });
  assert.equal((await data()).teachers.length, 1);
  await assert.rejects(api("invite_create"), /преподавателя/);
  await as(stranger);
  await data();
  await assert.rejects(
    api("student_join", { code: invite.code }),
    /недоступно/,
  );
  assert.equal(
    (await db.query("select * from tutor_student_links")).rows.length,
    0,
  );
  await as(owner);
  await api("student_save", {
    student_id: student,
    nickname: "Fixture learner",
    started_on: "2026-11-01",
    status: "active",
    notes: "PRIVATE TEACHER NOTE",
  });
  const parent = await api("topic_save", {
    section_id: (await data()).sections[0].id,
    title: "Fixture parent",
  });
  const topic = await api("topic_save", {
    section_id: (await data()).sections[0].id,
    parent_id: parent.id,
    title: "Fixture topic",
  });
  const module = await api("module_create", {
    topic_id: topic.id,
    title: "Fixture module",
  });
  const number = await api("task_save", {
    module_id: module.id,
    type: "number",
    title: "Fixture number",
    statement: "Original statement",
    difficulty: 1,
    answer: "42",
    reveal: "after_correct",
    solution: "Original solution",
  });
  const manual = await api("task_save", {
    module_id: module.id,
    type: "manual",
    title: "Fixture manual",
    statement: "Original manual",
    difficulty: 1,
    criteria: "Original criteria",
    answer: "",
    reveal: "after_correct",
    solution: "Original manual solution",
  });
  const imagePath = `${module.id}/${randomUUID()}.png`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('tutor-images',$1)",
    [imagePath],
  );
  let draft = (await data()).modules.find((m) => m.id === module.id);
  let revision = await api("module_save", {
    module_id: module.id,
    revision: draft.revision,
    title: draft.title,
    blocks: [
      { id: randomUUID(), type: "image", path: imagePath },
      ...[number, manual].map((x) => ({
        id: randomUUID(),
        type: "practice",
        task_id: x.id,
      })),
    ],
  });
  await api("publish", { module_id: module.id, revision: revision.revision });
  await api("module_access", { module_id: module.id, audience: "assigned" });
  await as(student);
  assert.equal((await data()).modules.length, 0);
  assert.equal(
    (await db.query("select * from tutor_publications")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  assert.equal(
    JSON.stringify(await data()).includes("PRIVATE TEACHER NOTE"),
    false,
  );
  assert.equal(
    (await db.query("select * from tutor_student_notes")).rows.length,
    0,
  );
  await assert.rejects(
    api("attempt", {
      task_id: number.id,
      version: revision.revision,
      answer: "42",
      request_id: randomUUID(),
    }),
    /недоступно/,
  );
  await assert.rejects(
    db.query("select tutor_private.api_v1('data','{}')"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select tutor_private.teaching_data(false)"),
    /permission denied/,
  );
  await as(owner);
  await api("module_assign", { student_id: student, module_id: module.id });
  const work = await api("homework_create", {
    student_id: student,
    title: "Fixture homework",
    comment: "Test comment",
    due_at: "2026-12-01T12:00:00Z",
    task_ids: [number.id, manual.id],
  });
  await assert.rejects(
    api("homework_create", {
      student_id: student,
      title: "Invalid",
      task_ids: [number.id, number.id],
    }),
    /разных/,
  );
  await assert.rejects(
    api("homework_create", {
      student_id: stranger,
      title: "Invalid",
      task_ids: [number.id],
    }),
    /активного/,
  );
  await as(student);
  let studentData = await data();
  assert.equal(studentData.modules.length, 1);
  assert.equal(studentData.topics.length, 2);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  assert.equal((await db.query("select * from tutor_topics")).rows.length, 2);
  assert.equal(studentData.homeworks.length, 1);
  assert.equal(
    JSON.stringify(studentData.homeworks).includes("Original criteria"),
    false,
  );
  const items = studentData.homeworks[0].items;
  const ni = items.find((i) => i.task_id === number.id),
    mi = items.find((i) => i.task_id === manual.id);
  const send = async (item, answer, extras = {}) =>
    api("attempt", {
      task_id: item.task_id,
      homework_item_id: item.id,
      version: item.snapshot.version,
      answer,
      request_id: randomUUID(),
      ...extras,
    });
  const wrong = await send(ni, "41");
  assert.equal(wrong.status, "wrong");
  assert.deepEqual(wrong.feedback, {});
  const pending = await send(mi, "Manual solution");
  assert.equal(pending.status, "pending");
  assert.equal(
    (await send(mi, "Manual solution", { request_id: pending.request_id })).id,
    pending.id,
  );
  await assert.rejects(
    send(ni, "42", { task_id: manual.id }),
    /не принадлежит/,
  );
  await assert.rejects(
    db.exec("update tutor_attempts set status='correct'"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("select * from tutor_private.homework_keys"),
    /permission denied/,
  );
  await as(stranger);
  assert.equal((await data()).homeworks.length, 0);
  assert.equal(
    (await db.query("select * from tutor_homework_items")).rows.length,
    0,
  );
  await assert.rejects(send(ni, "42"), /недоступна/);
  await as(otherTeacher);
  assert.equal((await data()).students.length, 0);
  await assert.rejects(
    api("student_save", { student_id: student }),
    /недоступен/,
  );
  await assert.rejects(
    api("review", { attempt_id: pending.id, status: "correct" }),
    /недоступна/,
  );
  assert.equal(
    (await db.query("select * from tutor_profiles where user_id=$1", [student]))
      .rows.length,
    0,
  );
  await as(owner);
  await api("task_save", {
    module_id: module.id,
    id: number.id,
    type: "number",
    title: "Changed number",
    statement: "Changed statement",
    difficulty: 1,
    answer: "43",
    reveal: "never",
  });
  await api("task_save", {
    module_id: module.id,
    id: manual.id,
    type: "manual",
    title: "Changed manual",
    statement: "Changed manual",
    difficulty: 1,
    criteria: "Changed criteria",
    answer: "",
    reveal: "never",
    solution: "Changed solution",
  });
  draft = (await data()).modules.find((m) => m.id === module.id);
  await api("publish", { module_id: module.id, revision: draft.revision });
  assert.equal(
    (await data()).review_queue.find((a) => a.id === pending.id).criteria,
    "Original criteria",
  );
  await api("review", {
    attempt_id: pending.id,
    status: "correct",
    comment: "Reviewed",
  });
  const lesson = await api("lesson_save", {
    student_id: student,
    starts_at: "2026-11-16T12:00:00Z",
    duration_minutes: 60,
    comment: "PRIVATE LESSON NOTE",
    topic_ids: [topic.id],
    homework_ids: [work.id],
  });
  assert.equal((await data()).lessons[0].id, lesson.id);
  await api("unpublish", { module_id: module.id });
  await as(student);
  const right = await send(ni, "42");
  assert.equal(right.status, "correct");
  assert.equal(right.task_snapshot.statement, "Original statement");
  assert.equal(right.feedback.solution, "Original solution");
  assert.equal(
    (await data()).attempts.find((a) => a.id === pending.id).feedback.solution,
    "Original manual solution",
  );
  // Repeated submissions in one transaction must still have a real chronology.
  await db.exec("begin");
  const repeatedWrong = await send(ni, "41"),
    repeatedRight = await send(ni, "42");
  assert.notEqual(repeatedWrong.created_at, repeatedRight.created_at);
  assert.equal(
    (await data()).attempts.find((a) => a.task_id === number.id).id,
    repeatedRight.id,
  );
  await db.exec("commit");
  const learnerLessons = (await data()).lessons;
  assert.equal(learnerLessons.length, 1);
  assert.equal(learnerLessons[0].status, "planned");
  assert.equal(learnerLessons[0].comment, undefined);
  assert.ok(learnerLessons[0].homework_ids.includes(work.id));
  assert.equal(JSON.stringify(learnerLessons).includes("PRIVATE LESSON NOTE"), false);
  await assert.rejects(api("lesson_save", { id: lesson.id, student_id: student, status: "completed" }), /недоступен/);
  await as(stranger);
  assert.equal((await data()).lessons.length, 0);
  await as(otherTeacher);
  await assert.rejects(api("lesson_save", { id: lesson.id, student_id: student, status: "canceled" }), /недоступен/);
  await as(owner);
  const record = (await data()).lessons.find((l) => l.id === lesson.id);
  const room = { lesson_id: lesson.id };
  assert.deepEqual(await api("lesson_room_read", room), {});
  await api("lesson_room_save", { ...room, code: "print(42)", notes: "Example", revision: 0 });
  await assert.rejects(api("lesson_room_save", { ...room, code: "stale", revision: 0 }), /другая вкладка|другой вкладке/);
  await as(student);
  const teacherDraft = (await api("lesson_room_read", room)).teacher;
  assert.equal(teacherDraft.code, "print(42)");
  assert.equal(teacherDraft.mode, "board");
  assert.deepEqual(teacherDraft.board, []);
  await assert.rejects(api("lesson_room_save", { ...room, area: "teacher", code: "changed", revision: 1 }), /только для просмотра/);
  await api("lesson_room_save", { ...room, code: "print(6 * 7)", notes: "My answer", revision: 0 });
  await as(stranger);
  await assert.rejects(api("lesson_room_read", room), /Урок недоступен/);
  await assert.rejects(api("lesson_room_save", { ...room, code: "print(1)", revision: 0 }), /Урок недоступен/);
  await as(owner);
  const drafts = await api("lesson_room_read", room);
  assert.equal(drafts.teacher.code, "print(42)");
  assert.equal(drafts.student.notes, "My answer");
  const board = [{ id: randomUUID(), kind: "line", points: [[10, 20], [300, 400]] }];
  await assert.rejects(api("lesson_room_save", { ...room, area: "student", board: {}, revision: 1 }), /Неверный формат/);
  assert.deepEqual(await api("lesson_room_save", { ...room, area: "student", board, revision: 1 }), { revision: 2 });
  await as(student);
  await assert.rejects(api("lesson_room_save", { ...room, area: "student", board: [], revision: 1 }), /другой вкладке/);
  assert.deepEqual(await api("lesson_room_save", { ...room, area: "student", mode: "code", revision: 2 }), { revision: 3 });
  const shared = await api("lesson_room_read", room);
  assert.equal(shared.teacher.mode, "board");
  assert.equal(shared.student.mode, "code");
  assert.equal(shared.student.code, "print(6 * 7)");
  assert.deepEqual(shared.student.board, board);
  await as(otherTeacher);
  await assert.rejects(api("lesson_room_save", { ...room, area: "student", board: [], revision: 3 }), /Урок недоступен/);
  await as(owner);
  const blockedDay = { day: "2026-11-16", time_zone: "Europe/Moscow", blocked: true };
  const blockedRequest = {
    student_id: student,
    starts_at: "2026-11-15T22:00:00Z",
    duration_minutes: 60,
  };
  await api("lesson_block_day", blockedDay);
  assert.deepEqual((await data()).blocked_lesson_days, [blockedDay.day]);
  await assert.rejects(api("lesson_save", blockedRequest), /Дата закрыта/);
  await assert.rejects(api("lesson_save", { ...record, starts_at: blockedRequest.starts_at }), /Дата закрыта/);
  await as(student);
  assert.equal((await data()).blocked_lesson_days, undefined);
  await assert.rejects(api("lesson_block_day", blockedDay), /роль преподавателя/);
  await as(otherTeacher);
  assert.deepEqual((await data()).blocked_lesson_days, []);
  await as(owner);
  await api("lesson_save", { ...record, status: "completed" });
  await api("lesson_block_day", { day: blockedDay.day, blocked: false });
  assert.deepEqual((await data()).blocked_lesson_days, []);
  await api("lesson_save", { ...record, starts_at: blockedRequest.starts_at, status: "completed" });
  assert.equal((await data()).lessons[0].status, "completed");
  await api("publish", { module_id: module.id, revision: draft.revision });
  const linked = await api("homework_create", { student_id: student, lesson_id: lesson.id, title: "Linked fixture", task_ids: [number.id] });
  assert.ok((await data()).lessons[0].homework_ids.includes(linked.id));
  await api("lesson_save", { ...record, homework_ids: [work.id, linked.id], status: "planned", starts_at: "2030-01-01T12:00:00Z" });
  await as(student);
  assert.equal((await data()).lessons[0].starts_at, "2030-01-01T12:00:00+00:00");
  await as(owner);
  const rescheduled = (await data()).lessons[0];
  await api("lesson_save", { ...rescheduled, status: "canceled" });
  await assert.rejects(api("lesson_room_read", room), /Урок недоступен/);
  await assert.rejects(api("homework_create", { student_id: student, lesson_id: lesson.id, title: "Invalid link", task_ids: [number.id] }), /доступное занятие/);
  await api("unpublish", { module_id: module.id });
  await as(student);
  assert.equal((await data()).lessons[0].status, "canceled");
  assert.equal((await data()).homeworks.find((h) => h.id === work.id).canceled_at, null);
  assert.equal((await db.query("select * from tutor_lessons")).rows.length, 0);
  await assert.rejects(
    api("attempt", {
      task_id: number.id,
      version: draft.revision,
      answer: "43",
      request_id: randomUUID(),
    }),
    /недоступно/,
  );
  await as(owner);
  const preview = await send(ni, "42", { preview: true });
  assert.equal(preview.is_preview, true);
  assert.equal(
    (await data()).attempts.some((a) => a.id === preview.id),
    false,
  );
  assert.equal((await data(true)).attempts.length, 1);
  await api("student_save", {
    student_id: student,
    nickname: "Fixture learner",
    started_on: "2026-11-01",
    status: "archived",
    notes: "PRIVATE TEACHER NOTE",
  });
  await as(student);
  assert.equal((await data()).homeworks.length, 0);
  assert.equal((await data()).lessons.length, 0);
  assert.equal((await data()).attempts.length, 5);
  await assert.rejects(send(ni, "42"), /недоступна/);
  await assert.rejects(
    api("student_join", { code: invite.code }),
    /архивирована/,
  );
  await as(owner);
  await api("student_save", {
    student_id: student,
    nickname: "Fixture learner",
    started_on: "2026-11-01",
    status: "active",
    notes: "",
  });
  await api("homework_cancel", { id: work.id });
  await as(student);
  assert.ok((await data()).homeworks.find((h) => h.id === work.id).canceled_at);
  await assert.rejects(send(ni, "42"), /недоступна/);
  await as(owner);
  await api("publish", { module_id: module.id, revision: draft.revision });
  await api("module_revoke", { student_id: student, module_id: module.id });
  await as(student);
  assert.equal((await data()).modules.length, 0);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query("delete from tutor_roles where user_id=$1", [owner]);
  await as(owner);
  assert.equal(
    (await db.query("select * from tutor_student_links")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from tutor_student_notes")).rows.length,
    0,
  );
  await assert.rejects(api("invite_create"), /преподавателя/);
});
