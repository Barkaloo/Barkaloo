import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, supabase } from "../lib/api";
import { Field, ErrorBox, Form } from "../components/ui";
export default function StudentSetup({
  onDone,
}: {
  onDone: () => Promise<unknown>;
}) {
  const [name, setName] = useState(""),
    [theme, setTheme] = useState("system"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api("student_setup", { display_name: name, theme });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="student-setup">
      <section className="panel">
        <span className="eyebrow">Добро пожаловать в Barkaloo Tutor</span>
        <h1>Как вас называть?</h1>
        <p className="muted">
          Выберите имя или ник. Его увидит ваш преподаватель; изменить его можно
          в настройках.
        </p>
        <Form onSubmit={save}>
          <Field label="Ваш ник">
            <input
              autoFocus
              required
              minLength={2}
              maxLength={60}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя или псевдоним"
            />
          </Field>
          <Field label="Оформление">
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Как на устройстве</option>
              <option value="light">Светлая тема</option>
              <option value="dark">Тёмная тема</option>
            </select>
          </Field>
          {error && <ErrorBox message={error} />}
          <button
            className="btn primary"
            disabled={busy || name.trim().length < 2}
          >
            {busy ? "Сохранение…" : "Начать обучение"}
            <ArrowRight size={16} />
          </button>
        </Form>
        <button
          className="text-btn"
          onClick={() => supabase.auth.signOut({ scope: "local" })}
        >
          Выйти
        </button>
      </section>
    </main>
  );
}
