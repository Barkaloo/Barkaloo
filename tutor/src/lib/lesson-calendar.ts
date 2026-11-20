import type { LessonRecord } from "../types";

export type LessonMonth = { year: number; month: number };

export function localLessonMonth(date: Date): LessonMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function getLessonMonth(
  lessons: readonly LessonRecord[],
  selected: LessonMonth,
  studentId = "",
) {
  const days = new Map<number, number>();
  const years = new Set([new Date().getFullYear(), selected.year - 1, selected.year, selected.year + 1]);
  const entries: { lesson: LessonRecord; timestamp: number }[] = [];
  for (const lesson of lessons) {
    if (lesson.status === "canceled" || (studentId && lesson.student_id !== studentId)) continue;
    const date = new Date(lesson.starts_at);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp)) continue;
    const { year, month } = localLessonMonth(date);
    years.add(year);
    if (year !== selected.year || month !== selected.month) continue;
    const day = date.getDate();
    days.set(day, (days.get(day) ?? 0) + 1);
    entries.push({ lesson, timestamp });
  }
  entries.sort((a, b) => a.timestamp - b.timestamp);
  return { days, years: [...years].sort((a, b) => a - b), lessons: entries.map(({ lesson }) => lesson) };
}
