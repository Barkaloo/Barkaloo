import type { Data } from "../types";

type TeacherData = Pick<Data, "students" | "lessons" | "review_queue">;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getTeacherOverview(data: TeacherData, now = Date.now()) {
  const activeIds = new Set(
    data.students.filter((s) => s.status === "active").map((s) => s.student_id),
  );
  const schedule = data.lessons
    .map((lesson) => ({ lesson, startsAt: Date.parse(lesson.starts_at) }))
    .filter(
      ({ lesson, startsAt }) =>
        activeIds.has(lesson.student_id) &&
        startsAt + lesson.duration_minutes * 60000 > now,
    )
    .sort((a, b) => a.startsAt - b.startsAt);
  return {
    activeStudentCount: activeIds.size,
    upcoming: schedule.map(({ lesson }) => lesson),
    weekLessonCount: schedule.filter(({ startsAt }) => startsAt < now + WEEK_MS)
      .length,
    pending: data.review_queue.filter(
      (a) => !a.is_preview && a.status === "pending",
    ),
  };
}
