import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { lessonDayKey, localLessonMonth, type LessonMonth } from "../lib/lesson-calendar";

const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" });
const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const months = Array.from({ length: 12 }, (_, index) => monthName.format(new Date(2024, index, 1)));

export default function LessonCalendar({ selected, days, years, onChange, selectedDay, onDayChange, blockedDays }: {
  selected: LessonMonth;
  days: ReadonlyMap<number, number>;
  years: readonly number[];
  onChange: (month: LessonMonth) => void;
  selectedDay: number | null;
  onDayChange: (day: number | null) => void;
  blockedDays: ReadonlySet<string>;
}) {
  const { year, month } = selected;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const currentMonth = localLessonMonth(today);
  const shift = (amount: number) => onChange(localLessonMonth(new Date(year, month + amount, 1)));
  return (
    <section className="panel lesson-calendar" aria-labelledby="lesson-calendar-title">
      <div className="spread lesson-calendar-header">
        <h2 id="lesson-calendar-title" aria-live="polite">{monthTitle.format(first)}</h2>
        <div className="lesson-calendar-nav" role="group" aria-label="Навигация по месяцам">
          <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <button className="icon-btn" aria-label="Следующий месяц" onClick={() => shift(1)}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="lesson-calendar-grid">
        {weekdays.map((label) => <span className="lesson-calendar-weekday" key={label}>{label}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}
        {Array.from({ length: lastDay }, (_, index) => {
          const day = index + 1;
          const count = days.get(day);
          const blocked = blockedDays.has(lessonDayKey(selected, day));
          const isToday = currentMonth.year === year && currentMonth.month === month && today.getDate() === day;
          const date = dayLabel.format(new Date(year, month, day));
          return (
            <button
              key={day}
              type="button"
              className={`lesson-calendar-day${count ? " has-lesson" : ""}${blocked ? " blocked" : ""}`}
              aria-label={`${date}${count ? `, занятий: ${count}` : ""}${blocked ? ", закрыто для новых занятий" : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selectedDay === day}
              onClick={() => onDayChange(selectedDay === day ? null : day)}
            >
              <span className="lesson-day-number">{day}</span>
              <span className="lesson-day-indicators" aria-hidden="true">
                {blocked && <Lock size={14} />}
                {count !== undefined && <span className="lesson-day-count">{count > 99 ? "99+" : count}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="lesson-month-filter" role="group" aria-label="Период списка занятий">
        <select aria-label="Месяц занятий" value={month} onChange={(e) => onChange({ year, month: Number(e.target.value) })}>
          {months.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
        <select aria-label="Год занятий" value={year} onChange={(e) => onChange({ year: Number(e.target.value), month })}>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </section>
  );
}
