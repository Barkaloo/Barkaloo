import { test } from "node:test";
import assert from "node:assert/strict";
import { homeworkSummary, homeworkState } from "../src/lib/teaching.ts";
import { getTeacherOverview } from "../src/lib/dashboard.ts";
import { getLessonMonth } from "../src/lib/lesson-calendar.ts";

test("Lesson calendar and list share local month, student filter and cancellation rules", () => {
  const lesson = (id, student_id, month, day, hour, status = "planned") => ({
    id, student_id, status, starts_at: new Date(2026, month, day, hour).toISOString(),
  });
  const lessons = [
    lesson("last", "a", 10, 30, 23, "completed"),
    lesson("first-late", "b", 10, 1, 18),
    lesson("outside", "a", 11, 1, 0),
    lesson("canceled", "a", 10, 3, 10, "canceled"),
    lesson("first-early", "a", 10, 1, 0),
  ];
  const month = { year: 2026, month: 10 };
  const all = getLessonMonth(lessons, month);
  assert.deepEqual(all.lessons.map((row) => row.id), ["first-early", "first-late", "last"]);
  assert.equal(all.days.get(1), 2);
  assert.equal(all.days.get(30), 1);
  assert.equal(all.days.has(3), false);
  const selected = getLessonMonth(lessons, month, "a");
  assert.deepEqual(selected.lessons.map((row) => row.id), ["first-early", "last"]);
  assert.equal(selected.days.get(1), 1);
  assert.deepEqual(getLessonMonth(lessons, { ...month, month: 11 }).lessons.map((row) => row.id), ["outside"]);
  assert.deepEqual(lessons.map((row) => row.id), ["last", "first-late", "outside", "canceled", "first-early"]);
});

const work = {
  id: "work",
  teacher_id: "teacher",
  student_id: "student",
  canceled_at: null,
  due_at: null,
  items: [{ id: "item-1" }, { id: "item-2" }],
};
const attempt = (id, item, status, created_at, extra = {}) => ({
  id,
  homework_item_id: item,
  student_id: "student",
  is_preview: false,
  status,
  created_at,
  ...extra,
});

test("Homework uses the newest attempt regardless of server ordering", () => {
  const rows = [
    attempt("old", "item-1", "wrong", "2030-01-01T08:00:00Z"),
    attempt("manual", "item-2", "pending", "2030-01-01T09:00:00Z"),
    attempt("new", "item-1", "correct", "2030-01-01T10:00:00Z"),
  ];
  const before = structuredClone(rows);
  for (const input of [
    rows,
    [...rows].reverse(),
    [rows[2], rows[0], rows[1]],
  ]) {
    const result = homeworkSummary(work, input);
    assert.equal(result.correct, 1);
    assert.equal(result.answered, 2);
    assert.equal(result.pending, 1);
    assert.equal(result.status, "pending");
  }
  assert.deepEqual(rows, before);
  assert.deepEqual(
    homeworkSummary(work, rows)
      .attemptsByItem.get("item-1")
      .map((a) => a.id),
    ["new", "old"],
  );
});

test("Teacher schedule uses chronological instants, active students and the seven-day boundary", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  const lesson = (
    id,
    starts_at,
    student_id = "active",
    duration_minutes = 60,
  ) => ({ id, starts_at, student_id, duration_minutes });
  const data = {
    students: [
      { student_id: "active", status: "active" },
      { student_id: "archived", status: "archived" },
    ],
    review_queue: [],
    lessons: [
      lesson("later-local", "2030-01-02T07:30:00Z"),
      lesson("earlier-offset", "2030-01-02T08:00:00+03:00"),
      lesson("ongoing", "2029-12-31T23:30:00Z"),
      lesson("ended", "2029-12-31T23:00:00Z"),
      lesson("week-edge", "2030-01-08T00:00:00Z"),
      lesson("archived", "2030-01-02T07:00:00Z", "archived"),
      lesson("invalid", "invalid"),
    ],
  };
  const before = structuredClone(data);
  const result = getTeacherOverview(data, now);
  assert.equal(result.activeStudentCount, 1);
  assert.equal(result.weekLessonCount, 3);
  assert.deepEqual(
    result.upcoming.map((l) => l.id),
    ["ongoing", "earlier-offset", "later-local", "week-edge"],
  );
  assert.deepEqual(data, before);
});

test("Teacher review count excludes preview and already graded answers", () => {
  const pending = attempt("real", "item-1", "pending", "2030-01-01T00:00:00Z");
  const result = getTeacherOverview(
    {
      students: [],
      lessons: [],
      review_queue: [
        pending,
        { ...pending, id: "preview", is_preview: true },
        { ...pending, id: "graded", status: "correct" },
      ],
    },
    0,
  );
  assert.deepEqual(result.pending, [pending]);
  assert.equal(result.weekLessonCount, 0);
});

test("Homework separates learner, preview and unrelated attempts", () => {
  const rows = [
    attempt("real", "item-1", "wrong", "2030-01-01T08:00:00Z"),
    attempt("preview", "item-1", "correct", "2030-01-01T09:00:00Z", {
      student_id: "teacher",
      is_preview: true,
    }),
    attempt("other", "item-2", "correct", "2030-01-01T10:00:00Z", {
      student_id: "other",
    }),
    attempt("other-work", "other-item", "correct", "2030-01-01T11:00:00Z"),
  ];
  const real = homeworkSummary(work, rows),
    preview = homeworkSummary(work, rows, true);
  assert.equal(real.answered, 1);
  assert.equal(real.correct, 0);
  assert.equal(preview.answered, 1);
  assert.equal(preview.correct, 1);
  assert.equal(
    homeworkSummary({ ...work, canceled_at: "2030-01-01T12:00:00Z" }, rows)
      .status,
    "canceled",
  );
});

test("Homework retains PostgreSQL microsecond ordering for fast retries", () => {
  const older = attempt(
    "older",
    "item-1",
    "wrong",
    "2030-01-01T08:00:00.123001+03:00",
  );
  const newer = attempt(
    "newer",
    "item-1",
    "correct",
    "2030-01-01T05:00:00.123999Z",
  );
  for (const rows of [
    [older, newer],
    [newer, older],
  ]) {
    const result = homeworkSummary(work, rows);
    assert.equal(result.correct, 1);
    assert.deepEqual(
      result.attemptsByItem.get("item-1").map((a) => a.id),
      ["newer", "older"],
    );
  }
});

test("Homework state follows submission, grading and deadline independently of lesson state", () => {
 const expired = {...work, due_at: "2000-01-01T00:00:00Z"};
 const first = attempt("first", "item-1", "wrong", "2030-01-01T00:00:00Z");
 const manual = attempt("manual", "item-2", "pending", "2030-01-01T00:00:00Z");
 assert.equal(homeworkState(work, []).state, "uncompleted");
 assert.equal(homeworkState(expired, [first]).state, "overdue");
 assert.equal(homeworkState(expired, [first, manual]).state, "overdue");
 assert.equal(homeworkState(expired, [first, {...manual, status: "wrong"}]).state, "overdue");
 assert.equal(homeworkState({...expired, canceled_at: "2030-01-01"}, []).state, "canceled");
});
test("Canceled and completed lessons never enter the upcoming teacher schedule", () => {
 const now=Date.parse("2030-01-01T00:00:00Z");
 const base={student_id:"s",starts_at:"2030-01-02T00:00:00Z",duration_minutes:60};
 const data={students:[{student_id:"s",status:"active"}],review_queue:[],lessons:[{...base,id:"p",status:"planned"},{...base,id:"c",status:"completed"},{...base,id:"x",status:"canceled"}]};
 assert.deepEqual(getTeacherOverview(data,now).upcoming.map(l=>l.id),["p"]);
});
test("An unfinished overdue work retains pending answers for the teacher", () => {
 const rows = [attempt("auto", "item-1", "correct", "2030-01-01T00:00:00Z"), attempt("manual", "item-2", "pending", "2030-01-01T00:00:00Z")];
 const result = homeworkState({...work, due_at: "2000-01-01T00:00:00Z"}, rows);
 assert.equal(result.state, "overdue");
 assert.equal(result.pending, 1);
 assert.equal(result.correct, 1);
 assert.equal(result.attemptsByItem.get("item-2")[0].status, "pending");
});
