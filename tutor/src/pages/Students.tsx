import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Copy,
  Search,
  Pencil,
  Plus,
  X,
  GraduationCap,
} from "lucide-react";
import { useApp } from "../context";
import { api, formatDate } from "../lib/api";
import { dateTime, homeworkSummary } from "../lib/teaching";
import type { Student, StudentInvite } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
export function Students() {
  const { data, teacher, navigate } = useApp();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("active"),
    [invite, setInvite] = useState(false);
  if (!teacher) return <Empty title="Раздел доступен преподавателю" />;
  const rows = data.students.filter(
    (s) =>
      (status === "all" || s.status === status) &&
      `${s.nickname} ${s.display_name}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Ваша учебная команда</span>
          <h1>Ученики</h1>
          <p>Материалы, домашние работы и результаты каждого ученика.</p>
        </div>
        <button className="btn primary" onClick={() => setInvite(true)}>
          <UserPlus size={16} />
          Пригласить ученика
        </button>
      </div>
      <div className="filter-bar">
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Имя или псевдоним…"
            aria-label="Поиск ученика"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Статус учеников"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Активные</option>
          <option value="archived">Архивные</option>
          <option value="all">Все ученики</option>
        </select>
      </div>
      {rows.length ? (
        <div className="student-grid">
          {rows.map((s) => {
            const attempts = data.attempts.filter(
              (a) => a.student_id === s.student_id && !a.is_preview,
            );
            const works = data.homeworks.filter(
              (h) => h.student_id === s.student_id && !h.canceled_at,
            );
            return (
              <button
                className="panel student-card"
                key={s.student_id}
                onClick={() => navigate(`student/${s.student_id}`)}
              >
                <div className="spread">
                  <span className="avatar">
                    {(s.nickname || s.display_name)[0].toUpperCase()}
                  </span>
                  <span
                    className={`badge ${s.status === "active" ? "green" : "neutral"}`}
                  >
                    {s.status === "active" ? "Активен" : "В архиве"}
                  </span>
                </div>
                <h3>{s.nickname || s.display_name}</h3>
                <p>Обучается с {formatDate(s.started_on)}</p>
                <div className="student-card-stats">
                  <span>{attempts.length} попыток</span>
                  <span>{works.length} домашних работ</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            data.students.length
              ? "Ученики не найдены"
              : "Добавьте первого ученика"
          }
          action="Создать приглашение"
          onAction={() => setInvite(true)}
        >
          Создайте одноразовую ссылку и передайте её ученику. После входа он
          сможет подключиться к вам.
        </Empty>
      )}
      {data.invites.length > 0 && (
        <section className="panel invitation-list">
          <h2>Приглашения</h2>
          <p className="muted">
            Ссылки действуют 7 дней и подходят для одного аккаунта.
          </p>
          {data.invites.slice(0, 15).map((i) => (
            <InviteRow key={i.id} invite={i} />
          ))}
        </section>
      )}
      {invite && <InviteModal onClose={() => setInvite(false)} />}
    </>
  );
}
function InviteRow({ invite: i }: { invite: StudentInvite }) {
  const { refresh, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const expired = new Date(i.expires_at).getTime() < Date.now();
  const revoke = async () => {
    setBusy(true);
    try {
      await api("invite_revoke", { id: i.id });
      await refresh();
      notify("Приглашение отозвано");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="invitation-row">
      <div>
        <strong>{i.label || "Приглашение ученика"}</strong>
        <small>
          {i.used_by
            ? "Использовано"
            : i.revoked
              ? "Отозвано"
              : expired
                ? "Срок истёк"
                : `До ${dateTime(i.expires_at)}`}
        </small>
        {error && <ErrorBox message={error} />}
      </div>
      {!i.used_by && !i.revoked && !expired && (
        <button className="btn small" disabled={busy} onClick={revoke}>
          Отозвать
        </button>
      )}
    </div>
  );
}
function InviteModal({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useApp();
  const [label, setLabel] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>("invite_create", { label });
      setCode(result.code);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const link = `${location.origin}/tutor/#/join/${code}`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Скопировано");
    } catch {
      setError(
        "Не удалось скопировать автоматически. Выделите и скопируйте текст вручную.",
      );
    }
  };
  return (
    <Modal title="Пригласить ученика" onClose={onClose}>
      {code ? (
        <>
          <p className="muted">
            Передайте ссылку ученику. Он войдёт в свой аккаунт и подтвердит
            подключение. Ссылка показывается один раз — сохраните её перед
            закрытием.
          </p>
          <Field label="Ссылка для ученика">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </Field>
          <button className="btn primary" onClick={() => copy(link)}>
            <Copy size={15} />
            Скопировать ссылку
          </button>
          <Field label="Код приглашения">
            <input
              className="mono"
              readOnly
              value={code}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          <button className="text-btn" onClick={() => copy(code)}>
            Скопировать код
          </button>
        </>
      ) : (
        <Form onSubmit={create}>
          <p className="muted">
            Приглашение действует 7 дней. Письма не отправляются автоматически.
          </p>
          <Field label="Подпись для себя">
            <input
              autoFocus
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например, имя будущего ученика"
            />
          </Field>
          <button className="btn primary" disabled={busy}>
            {busy ? "Создание…" : "Создать ссылку"}
          </button>
        </Form>
      )}
      {error && <ErrorBox message={error} />}
    </Modal>
  );
}
export function StudentPage({ id }: { id: string }) {
  const { data, teacher, navigate, refresh, notify } = useApp();
  const s = data.students.find((s) => s.student_id === id);
  const [editing, setEditing] = useState(false),
    [moduleId, setModuleId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!teacher || !s)
    return (
      <Empty
        title="Ученик недоступен"
        action="Открыть учеников"
        onAction={() => navigate("students")}
      />
    );
  const attempts = data.attempts.filter(
      (a) => a.student_id === id && !a.is_preview,
    ),
    graded = attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const assignments = data.assignments.filter((a) => a.student_id === id),
    works = data.homeworks.filter((h) => h.student_id === id),
    lessons = data.lessons.filter((l) => l.student_id === id),
    progress = data.student_progress.filter((p) => p.user_id === id);
  const assign = async () => {
    if (!moduleId) return;
    setBusy(true);
    setError("");
    try {
      await api("module_assign", { student_id: id, module_id: moduleId });
      await refresh();
      setModuleId("");
      notify("Модуль назначен ученику");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (mid: string) => {
    setBusy(true);
    try {
      await api("module_revoke", { student_id: id, module_id: mid });
      await refresh();
      notify(
        "Назначение отозвано. Открытые для всех модули остаются доступны.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="back-link" onClick={() => navigate("students")}>
        <ArrowLeft size={16} />
        Ученики
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Карточка ученика</span>
          <h1>{s.nickname || s.display_name}</h1>
          <p>
            Начало обучения: {formatDate(s.started_on)} ·{" "}
            {s.status === "active" ? "Активен" : "В архиве"}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          Редактировать
        </button>
      </div>
      <div className="metrics-grid">
        <div className="metric panel">
          <span>Попытки</span>
          <strong>{attempts.length}</strong>
          <small>В ваших модулях и домашних работах</small>
        </div>
        <div className="metric panel">
          <span>Правильных ответов</span>
          <strong>
            {graded.length
              ? `${Math.round((correct.length / graded.length) * 100)}%`
              : "—"}
          </strong>
          <small>
            {correct.length} из {graded.length} проверенных
          </small>
        </div>
        <div className="metric panel">
          <span>Завершено модулей</span>
          <strong>{progress.filter((p) => p.completed_at).length}</strong>
          <small>Отмечены учеником как изученные</small>
        </div>
        <div className="metric panel">
          <span>Занятий в журнале</span>
          <strong>
            {
              lessons.filter(
                (l) => new Date(l.starts_at).getTime() <= Date.now(),
              ).length
            }
          </strong>
          <small>Прошедшие даты</small>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="student-detail-grid">
        <section className="panel">
          <div className="spread">
            <h2>Назначенные модули</h2>
            <GraduationCap size={18} />
          </div>
          {assignments.length ? (
            assignments.map((a) => {
              const m = data.modules.find((m) => m.id === a.module_id);
              const p = progress.find((p) => p.module_id === a.module_id);
              return (
                <div className="assigned-row" key={a.module_id}>
                  <div>
                    <strong>{m?.title ?? "Модуль"}</strong>
                    <small>
                      {!m?.published_at
                        ? "Снят с публикации"
                        : p?.completed_at
                          ? "Изучен"
                          : p
                            ? "В процессе"
                            : "Не начат"}{" "}
                      ·{" "}
                      {m?.audience === "assigned"
                        ? "Личный доступ"
                        : "Доступен всем"}
                    </small>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Отозвать назначение ${m?.title ?? ""}`}
                    disabled={busy}
                    onClick={() => revoke(a.module_id)}
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="inline-empty">Назначений пока нет.</p>
          )}
          {s.status === "active" && (
            <Form onSubmit={assign}>
              <Field label="Опубликованный модуль">
                <select
                  required
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                >
                  <option value="">Выберите модуль</option>
                  {data.modules
                    .filter(
                      (m) =>
                        m.published_at &&
                        !assignments.some((a) => a.module_id === m.id),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="btn small" disabled={busy || !moduleId}>
                <Plus size={15} />
                Назначить
              </button>
            </Form>
          )}
          <p className="field-hint">
            Чтобы закрыть модуль от остальных учеников, выберите в конструкторе
            доступ «Только назначенные».
          </p>
        </section>
        <section className="panel">
          <div className="spread">
            <h2>Заметки преподавателя</h2>
            <button
              className="icon-btn"
              aria-label="Редактировать заметки"
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} />
            </button>
          </div>
          <p className="private-note">
            {s.notes ||
              "Личные наблюдения и планы занятий. Заметки видны только вам."}
          </p>
          <small className="muted">Ученик не получает эти заметки.</small>
        </section>
      </div>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>Домашние задания</h2>
          {s.status === "active" && (
            <button
              className="btn small"
              onClick={() => navigate(`homework-new/${id}`)}
            >
              <Plus size={14} />
              Назначить работу
            </button>
          )}
        </div>
        {works.length ? (
          works.map((w) => {
            const result = homeworkSummary(w, data.attempts);
            return (
              <button
                className="homework-highlight"
                key={w.id}
                onClick={() => navigate(`homework/${w.id}`)}
              >
                <div>
                  <strong>{w.title}</strong>
                  <small>{dateTime(w.due_at)}</small>
                </div>
                <span className="badge neutral">
                  {result.label} · {result.correct}/{result.total}
                </span>
              </button>
            );
          })
        ) : (
          <p className="inline-empty">Домашних заданий пока нет.</p>
        )}
      </section>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>История результатов</h2>
          <button className="text-btn" onClick={() => navigate(`stats/${id}`)}>
            Подробная статистика
            <ArrowRight size={15} />
          </button>
        </div>
        {attempts.length ? (
          <div className="results-list">
            {attempts.slice(0, 12).map((a) => (
              <div key={a.id}>
                <span>
                  <strong>{a.task_snapshot.title}</strong>
                  <small>
                    {dateTime(a.created_at)}
                    {a.homework_item_id ? " · Домашняя работа" : ""}
                  </small>
                </span>
                <span className={`status ${a.status}`}>
                  {a.status === "correct"
                    ? "Верно"
                    : a.status === "wrong"
                      ? "Ошибка"
                      : "На проверке"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="inline-empty">
            Результаты появятся после первых ответов ученика.
          </p>
        )}
      </section>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>Занятия</h2>
          <button className="text-btn" onClick={() => navigate("lessons")}>
            Открыть журнал
            <ArrowRight size={15} />
          </button>
        </div>
        {lessons.length ? (
          lessons.slice(0, 5).map((l) => (
            <div className="assigned-row" key={l.id}>
              <strong>{dateTime(l.starts_at)}</strong>
              <span>{l.duration_minutes} мин</span>
            </div>
          ))
        ) : (
          <p className="inline-empty">Занятия ещё не добавлены.</p>
        )}
      </section>
      {editing && <StudentEdit student={s} onClose={() => setEditing(false)} />}
    </>
  );
}
function StudentEdit({
  student: s,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { refresh, notify } = useApp();
  const [form, setForm] = useState({
      nickname: s.nickname,
      started_on: s.started_on,
      status: s.status,
      notes: s.notes,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const startedInput = useRef<HTMLInputElement>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api("student_save", {
        student_id: s.student_id,
        ...form,
        started_on: startedInput.current!.value,
      });
      await refresh();
      notify("Карточка ученика сохранена");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Карточка ученика" onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Имя или псевдоним для журнала">
          <input
            maxLength={100}
            value={form.nickname}
            placeholder={s.display_name}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          />
        </Field>
        <Field label="Начало обучения">
          <input
            required
            type="date"
            ref={startedInput}
            defaultValue={form.started_on}
          />
        </Field>
        <Field label="Статус">
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Student["status"] })
            }
          >
            <option value="active">Активен</option>
            <option value="archived">В архиве</option>
          </select>
        </Field>
        <p className="field-hint">
          Архивирование закрывает личные назначения и домашние работы. История
          результатов сохраняется. Доступ можно восстановить.
        </p>
        <Field label="Личные заметки преподавателя">
          <textarea
            rows={5}
            maxLength={20000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function Connect({ initialCode = "" }: { initialCode?: string }) {
  const { data, preview, refresh, notify } = useApp();
  const [code, setCode] = useState(initialCode),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    setError("");
    try {
      await api("student_join", { code: code.trim() });
      await refresh();
      setCode("");
      notify("Вы подключились к преподавателю");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Учитесь вместе</span>
          <h1>Мои преподаватели</h1>
          <p>
            Подключитесь по приглашению, чтобы получать персональные материалы и
            домашние работы.
          </p>
        </div>
      </div>
      <section className="panel connect-panel">
        <h2>Принять приглашение</h2>
        {preview ? (
          <p className="inline-empty">
            В режиме просмотра приглашения не принимаются. Ссылку использует
            ученик в своём аккаунте.
          </p>
        ) : (
          <Form onSubmit={join}>
            <Field label="Код приглашения">
              <input
                required
                className="mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код из ссылки преподавателя"
              />
            </Field>
            {error && <ErrorBox message={error} />}
            <button className="btn primary" disabled={busy || !code.trim()}>
              {busy ? "Подключение…" : "Подключиться к преподавателю"}
            </button>
          </Form>
        )}
      </section>
      {data.teachers.length > 0 && (
        <div className="student-grid teaching-section">
          {data.teachers.map((t) => (
            <section className="panel" key={t.teacher_id}>
              <span className="avatar">{t.display_name[0].toUpperCase()}</span>
              <h3>{t.display_name}</h3>
              <p className="muted">
                {t.status === "active"
                  ? "Обучение активно"
                  : "Обучение архивировано преподавателем"}
              </p>
              <small className="muted">С {formatDate(t.started_on)}</small>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
