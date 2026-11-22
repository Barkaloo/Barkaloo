import { useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { Field, ErrorBox } from "../components/ui";
export default function Settings() {
  const { data, refresh, notify } = useApp();
  const [name, setName] = useState(data.profile.display_name),
    [theme, setTheme] = useState(data.profile.theme),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("profile", { display_name: name, theme });
      await refresh();
      notify("Настройки сохранены");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), ...data },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barkaloo-tutor-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Настройки</h1>
        </div>
      </div>
      <div className="settings-layout">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>Профиль</h2>
          <Field label="Имя или псевдоним">
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Тема интерфейса">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as typeof theme)}
            >
              <option value="system">Как на устройстве</option>
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
            </select>
          </Field>
          <p className="muted">
            Роль: {data.role === "teacher" ? "преподаватель" : "ученик"}
          </p>
          {data.role === "teacher" && (
            <p><a className="text-btn" href="?role=student" target="_blank" rel="noopener">
              Открыть вход ученика в новой вкладке
            </a></p>
          )}
          {error && <ErrorBox message={error} />}
          <button className="btn primary" disabled={busy}>
            <CheckCircle2 size={16} />
            {busy ? "Сохранение…" : "Сохранить настройки"}
          </button>
        </form>
        <section className="panel">
          <h2>Ваши данные</h2>
          <p className="muted">
            Материалы, попытки и прогресс текущего аккаунта в формате JSON.
          </p>
          <button className="btn" onClick={download}>
            <Download size={16} />
            Экспортировать данные
          </button>

        </section>
      </div>
    </>
  );
}
