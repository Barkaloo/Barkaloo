import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { ErrorBox, Field } from "./ui";
export default function ModuleAccess({ moduleId }: { moduleId: string }) {
  const { data, refresh, notify, navigate } = useApp();
  const m = data.modules.find((m) => m.id === moduleId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      await api("module_access", { module_id: moduleId, audience: value });
      await refresh();
      notify("Доступ к опубликованному модулю обновлён");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="module-access panel">
      <span className="eyebrow">
        <ShieldCheck size={13} />
        Доступ к модулю
      </span>
      <Field label="Кто видит публикацию">
        <select
          disabled={busy || !m?.published_at}
          value={m?.audience ?? "all"}
          onChange={(e) => void change(e.target.value)}
        >
          <option value="all">Все вошедшие ученики</option>
          <option value="assigned">Только назначенные ученики</option>
        </select>
      </Field>
      <p className="muted">
        {m?.published_at
          ? "Настройка применяется сразу к опубликованной версии. Назначения выдаются в карточке ученика."
          : "Сначала опубликуйте модуль. Черновик доступен только вам."}
      </p>
      <button className="text-btn" onClick={() => navigate("students")}>
        Открыть учеников
      </button>
      {error && <ErrorBox message={error} />}
    </div>
  );
}
