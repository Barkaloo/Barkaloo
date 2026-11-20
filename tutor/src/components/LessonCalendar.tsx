import { ChevronLeft, ChevronRight } from "lucide-react";
import { localLessonMonth, type LessonMonth } from "../lib/lesson-calendar";

const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" });
const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const months = Array.from({ length: 12 }, (_, index) => monthName.format(new Date(2024, index, 1)));

export default function LessonCalendar({ selected, days, years, onChange }: {
  selected: LessonMonth;
  days: ReadonlyMap<number, number>;
  years: readonly number[];
  onChange: (month: LessonMonth) => void;
}) {
  const { year, month } = selected;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const currentMonth = localLessonMonth(today);
  const shift = (amount: number) => onChange(localLessonMonth(new Date(year, month + amount, 1)));
  return <>
    <section className="panel lesson-calendar" aria-labelledby="lesson-calendar-title">
      <div className="spread">
        <h2 id="lesson-calendar-title">{monthTitle.format(first)}</h2>
        <div className="actions">
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
          const isToday = currentMonth.year === year && currentMonth.month === month && today.getDate() === day;
          return <div key={day} className={`lesson-calendar-day${count ? " has-lesson" : ""}`} aria-current={isToday ? "date" : undefined}
            title={count ? `Занятий: ${count}` : undefined}>
            {day}
            {count && <><span className="lesson-calendar-dot" aria-hidden="true" /><span className="sr-only"> · занятий: {count}</span></>}
          </div>;
        })}
      </div>
      <p className="lesson-calendar-legend"><span className="lesson-calendar-dot" aria-hidden="true" />Есть занятие</p>
    </section>
    <div className="filter-bar lesson-month-filter" role="group" aria-label="Период списка занятий">
      <select aria-label="Месяц занятий" value={month} onChange={(e) => onChange({ year, month: Number(e.target.value) })}>
        {months.map((label, index) => <option key={label} value={index}>{label}</option>)}
      </select>
      <select aria-label="Год занятий" value={year} onChange={(e) => onChange({ year: Number(e.target.value), month })}>
        {years.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
  </>;
}
