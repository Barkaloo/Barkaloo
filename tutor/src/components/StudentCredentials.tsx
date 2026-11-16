import { useEffect, useState } from "react";
import { Copy, RefreshCw, KeyRound } from "lucide-react";
import { useApp } from "../context";
import { studentAccess } from "../lib/api";
import { Busy, ErrorBox, Field, Form, Modal } from "./ui";
type Credential = {
  student_id: string;
  code: string;
  version: number;
  enabled: boolean;
};
function CodeDetails({ credential }: { credential: Credential }) {
  const { notify } = useApp();
  const [error, setError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.code);
      notify("Код скопирован");
    } catch {
      setError("Выделите и скопируйте код вручную.");
    }
  };
  return (
    <>
      <div className="credential-code">
        <span>Постоянный код для входа</span>
        <strong>{credential.code}</strong>
      </div>
      <Field label="Код ученика">
        <input
          className="mono"
          readOnly
          value={credential.code}
          onFocus={(e) => e.target.select()}
        />
      </Field>
      <button className="btn primary" onClick={copy}>
        <Copy size={15} />
        Скопировать код
      </button>
      <p className="field-hint">
        Передайте ученику код и адрес {location.origin}/tutor/. Код подходит для
        повторного входа на любом устройстве. Он открывает доступ к аккаунту
        ученика.
      </p>
      {error && <ErrorBox message={error} />}
    </>
  );
}
export function AddStudentDialog({ onClose }: { onClose: () => void }) {
  const { refresh, navigate } = useApp();
  const [requestId] = useState(() => crypto.randomUUID()),
    [nickname, setNickname] = useState(""),
    [credential, setCredential] = useState<Credential | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await studentAccess<Credential>("create", {
        request_id: requestId,
        nickname,
      });
      setCredential(next);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={credential ? "Ученик добавлен" : "Добавить ученика"}
      onClose={onClose}
    >
      {credential ? (
        <>
          <CodeDetails credential={credential} />
          <button
            className="text-btn"
            onClick={() => {
              onClose();
              navigate(`student/${credential.student_id}`);
            }}
          >
            Открыть карточку ученика
          </button>
        </>
      ) : (
        <Form onSubmit={create}>
          <p className="muted">
            Создайте аккаунт с постоянным шестизначным кодом. При первом входе
            ученик выберет себе ник и оформление.
          </p>
          <Field
            label="Имя для вашего журнала"
            hint="Необязательно. Можно изменить в карточке"
          >
            <input
              autoFocus
              maxLength={100}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Как вам удобно называть ученика"
            />
          </Field>
          <button className="btn primary" disabled={busy}>
            <KeyRound size={15} />
            {busy ? "Создаём аккаунт…" : "Добавить и получить код"}
          </button>
        </Form>
      )}
      {error && <ErrorBox message={error} />}
    </Modal>
  );
}
export function StudentCodeDialog({
  studentId,
  active,
  onClose,
}: {
  studentId: string;
  active: boolean;
  onClose: () => void;
}) {
  const { refresh, notify } = useApp();
  const [credential, setCredential] = useState<Credential | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    studentAccess<Credential>("show", { student_id: studentId })
      .then((r) => {
        if (alive) setCredential(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId]);
  const change = async (action: "rotate" | "enabled") => {
    if (!credential) return;
    if (
      action === "rotate" &&
      !window.confirm(
        "Заменить код? Старый код и прежние сеансы входа закроются. Результаты ученика сохранятся.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const next = await studentAccess<Credential>(action, {
        student_id: studentId,
        version: credential.version,
        enabled: !credential.enabled,
      });
      setCredential(next);
      await refresh();
      notify(
        action === "rotate"
          ? "Новый код готов. Передайте его ученику"
          : next.enabled
            ? "Вход по коду разрешён"
            : "Вход по коду приостановлен",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Код для входа ученика" onClose={onClose}>
      {!credential && busy ? (
        <Busy text="Загружаем код…" />
      ) : (
        credential && (
          <>
            <CodeDetails credential={credential} />
            <div className="code-access-state">
              <span
                className={`badge ${active && credential.enabled ? "green" : "amber"}`}
              >
                {active && credential.enabled ? "Вход разрешён" : "Вход закрыт"}
              </span>
              {!active && (
                <p>
                  Ученик в архиве. Восстановите его карточку, чтобы разрешить
                  вход.
                </p>
              )}
            </div>
            <div className="credential-actions">
              <button
                className="btn"
                disabled={busy}
                onClick={() => change("rotate")}
              >
                <RefreshCw size={15} />
                Новый код
              </button>
              <button
                className="btn"
                disabled={busy || !active}
                onClick={() => change("enabled")}
              >
                {credential.enabled ? "Приостановить вход" : "Разрешить вход"}
              </button>
            </div>
            <p className="field-hint">
              Новый код сохраняет аккаунт и историю ученика. Прежние сеансы
              перестают открывать данные Tutor.
            </p>
          </>
        )
      )}
      {error && <ErrorBox message={error} />}
    </Modal>
  );
}
