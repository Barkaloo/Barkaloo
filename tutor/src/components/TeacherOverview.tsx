import {
  Users,
  CalendarDays,
  ClipboardCheck,
  ArrowUpRight,
  Clock3,
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
      label: "Ваши ученики",
      value: activeStudentCount,
      detail: "Активных в вашем кабинете",
      icon: Users,
    },
    {
      label: "Занятия на неделю",
      value: weekLessonCount,
      detail: "В ближайшие 7 дней",
      icon: CalendarDays,
    },
    {
      label: "Ожидают проверки",
      value: pending.length,
      detail: "Ответов с ручной проверкой",
      icon: ClipboardCheck,
    },
  ];
  return (
    <>
      <div className="teacher-summary">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <div className="panel teacher-summary-card" key={label}>
            <span className="teacher-summary-icon">
              <Icon size={20} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="teacher-workspace">
        <section className="panel teacher-agenda">
          <div className="spread">
            <div>
              <span className="eyebrow">Ваше расписание</span>
              <h2>Ближайшие занятия</h2>
            </div>
            <button className="text-btn" onClick={() => navigate("lessons")}>
              Журнал занятий <ArrowUpRight size={15} />
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
              <CalendarDays size={25} />
              <h3>Расписание свободно</h3>
              <p>
                Запланированные занятия появятся здесь после добавления в
                журнал.
              </p>
            </div>
          )}
        </section>
        <section className="panel teacher-inbox">
          <div className="spread">
            <div>
              <span className="eyebrow">Требует внимания</span>
              <h2>Проверка ответов</h2>
            </div>
            <Clock3 size={19} />
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
              <ClipboardCheck size={25} />
              <h3>Нет ответов для проверки</h3>
              <p>Здесь будут ответы учеников, которым нужна ваша оценка.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
