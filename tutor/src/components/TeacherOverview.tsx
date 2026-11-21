import {
  Users,
  CalendarDays,
  ClipboardCheck,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../context";
import { dateTime, studentName } from "../lib/teaching";
import type { Attempt } from "../types";
import { getTeacherOverview } from "../lib/dashboard";

export default function TeacherOverview({
  onReview,
}: {
  onReview: (attempt: Attempt) => void;
}) {
  const { data, navigate } = useApp();
  const { activeStudentCount, upcoming, weekLessonCount, pending } =
    getTeacherOverview(data);
  const cards = [
    {
      label: "Активные ученики",
      value: activeStudentCount,
      icon: Users,
    },
    {
      label: "Занятия на неделю",
      value: weekLessonCount,
      icon: CalendarDays,
    },
    {
      label: "Ответы на проверке",
      value: pending.length,
      icon: ClipboardCheck,
    },
  ];
  return (
    <>
      <div className="teacher-summary">
        {cards.map(({ label, value, icon: Icon }) => (
          <div className="teacher-summary-card" key={label}>
            <span className="teacher-summary-icon">
              <Icon size={20} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="teacher-workspace">
        <section className="panel teacher-agenda">
          <div className="spread">
            <div>
              <h2>Ближайшие занятия</h2>
            </div>
            <button className="text-btn" onClick={() => navigate("lessons")}>
              В журнал <ArrowUpRight size={15} />
            </button>
          </div>
          {upcoming.length ? (
            <div className="teacher-agenda-list">
              {upcoming.slice(0, 4).map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`student/${l.student_id}`)}
                >
                  <span className="teacher-lesson-icon">
                    <CalendarDays size={19} />
                  </span>
                  <span>
                    <strong>{studentName(data, l.student_id)}</strong>
                    <small>
                      {dateTime(l.starts_at)} · {l.duration_minutes} мин.
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="teacher-panel-empty">
              <p>Нет запланированных занятий.</p>
            </div>
          )}
        </section>
        <section className="panel teacher-inbox">
          <div className="spread">
            <div>
              <h2>Проверка ответов</h2>
            </div>
          </div>
          {pending.length ? (
            <div className="teacher-inbox-list">
              {pending.map((a) => (
                <div key={a.id}>
                  <div>
                    <strong>{studentName(data, a.student_id)}</strong>
                    <p>{a.task_snapshot.title}</p>
                    <small>{dateTime(a.created_at)}</small>
                  </div>
                  <button className="btn small" onClick={() => onReview(a)}>
                    Проверить
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="teacher-panel-empty">
              <p>Нет ответов для проверки.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
