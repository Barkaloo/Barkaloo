import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { configured, studentAccess, supabase } from "../lib/api";
import { Field, ErrorBox } from "../components/ui";
const translate = (message: string) =>
  message.includes("Invalid login credentials")
    ? "Неверный email или пароль."
    : message.includes("Email not confirmed")
      ? "Подтвердите email вашего аккаунта преподавателя."
      : message.includes("rate limit")
        ? "Слишком много запросов. Попробуйте позже."
        : message.includes("fetch")
          ? "Не удалось связаться с сервером. Проверьте интернет."
          : message;
export default function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const [audience, setAudience] = useState<"student" | "teacher">("student");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const student = audience === "student" && !recovery;
  const submit = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (student) {
        const session = await studentAccess<{
          access_token: string;
          refresh_token: string;
        }>("login", { code });
        location.hash = "/dashboard";
        const { error } = await supabase.auth.setSession(session);
        if (error) throw error;
      } else if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/tutor/`,
        });
        if (error) throw error;
        setMessage(
          "Если аккаунт существует, запрос на восстановление принят. Проверьте почту.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        location.hash = "/dashboard";
      }
    } catch (e) {
      setError(translate((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const change = (value: "student" | "teacher") => {
    setAudience(value);
    setMode("signin");
    setError("");
    setMessage("");
  };
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="/" className="brand">
          <span className="brand-mark">
            b<span>.</span>
          </span>
          <div>
            Barkaloo<span>Tutor</span>
          </div>
        </a>
        <div className="auth-story-content">
          <span className="eyebrow">ЕГЭ по информатике</span>
          <h1>
            Понимать.
            <br />
            Практиковаться.
            <br />
            <em>Двигаться вперёд.</em>
          </h1>
          <p>
            Спокойное пространство для знаний.
            <br />
            Ваша теория, практика и прогресс — в одном месте.
          </p>
          <div className="auth-feature">
            <BookOpen size={20} />
            <span>От первой темы до уверенного решения</span>
          </div>
        </div>
        <div className="auth-story-footer">
          Часть экосистемы Barkaloo<span>English · Fit · Tutor</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="eyebrow">Barkaloo Tutor</span>
          <h2>
            {recovery
              ? "Новый пароль"
              : student
                ? "Вход для ученика"
                : mode === "reset"
                  ? "Восстановление доступа"
                  : "Вход для преподавателя"}
          </h2>
          <p>
            {recovery
              ? "Задайте новый пароль вашего аккаунта."
              : student
                ? "Введите постоянный код, который выдал ваш преподаватель."
                : mode === "reset"
                  ? "Введите email вашего аккаунта."
                  : "Войдите с вашим аккаунтом Barkaloo."}
          </p>
          {!recovery && (
            <div
              className="auth-audience"
              role="group"
              aria-label="Способ входа"
            >
              <button
                type="button"
                className={student ? "active" : ""}
                aria-pressed={student}
                  disabled={busy}
                onClick={() => change("student")}
              >
                Я ученик
              </button>
              <button
                type="button"
                className={!student ? "active" : ""}
                aria-pressed={!student}
                  disabled={busy}
                onClick={() => change("teacher")}
              >
                Преподаватель
              </button>
            </div>
          )}
          {!configured ? (
            <ErrorBox message="Платформа ещё не подключена к базе. Обратитесь к преподавателю." />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {student ? (
                <Field
                  label="Шестизначный код"
                  hint="Один код для повторного входа и сохранённого прогресса"
                >
                  <div className="code-input-wrap">
                    <input
                      autoFocus
                      className="student-code-input"
                      aria-label="Шестизначный код"
                      disabled={busy}
                      type={showCode ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      placeholder="000000"
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\s/g, ""))
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={showCode ? "Скрыть код" : "Показать код"}
                      onClick={() => setShowCode((v) => !v)}
                    >
                      {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
              ) : (
                <>
                  {!recovery && (
                    <Field label="Электронная почта">
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        placeholder="you@example.com"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </Field>
                  )}
                  {(recovery || mode === "signin") && (
                    <Field
                      label="Пароль"
                      hint={recovery ? "Не менее 10 символов" : undefined}
                    >
                      <input
                        type="password"
                        required
                        autoComplete={
                          recovery ? "new-password" : "current-password"
                        }
                        minLength={recovery ? 10 : 1}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                  )}
                  {mode === "signin" && !recovery && (
                    <button
                      type="button"
                      className="text-btn forgot"
                      onClick={() => {
                        setMode("reset");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Забыли пароль?
                    </button>
                  )}
                </>
              )}
              {error && <ErrorBox message={error} />}{" "}
              {message && (
                <div className="success-box" role="status">
                  {message}
                </div>
              )}
              <button className="btn primary auth-submit" disabled={busy}>
                {busy
                  ? "Подождите…"
                  : recovery
                    ? "Сохранить пароль"
                    : student
                      ? "Войти по коду"
                      : mode === "signin"
                        ? "Войти"
                        : "Отправить письмо"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {student ? (
            <div className="auth-switch">
              Нет кода? Попросите преподавателя добавить вас в кабинет.
            </div>
          ) : (
            mode === "reset" &&
            !recovery && (
              <div className="auth-switch">
                <button
                  onClick={() => {
                    setMode("signin");
                    setError("");
                    setMessage("");
                  }}
                >
                  <ArrowLeft size={14} />
                  Вернуться ко входу
                </button>
              </div>
            )
          )}
          <div className="auth-note">
            <ShieldCheck size={16} />
            <span>
              {student
                ? "Код остаётся вашим. Прогресс сохраняется между входами."
                : "Доступ к материалам и результатам проверяется на сервере."}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
