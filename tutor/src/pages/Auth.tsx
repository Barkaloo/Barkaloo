import { useState } from "react";
import { ArrowRight, BookOpen, ShieldCheck, ArrowLeft } from "lucide-react";
import { configured, supabase } from "../lib/api";
import { Field, ErrorBox } from "../components/ui";
const translate = (message: string) =>
  message.includes("Invalid login credentials")
    ? "Неверный email или пароль."
    : message.includes("Email not confirmed")
      ? "Подтвердите email по ссылке из письма."
      : message.includes("already registered")
        ? "Этот email уже зарегистрирован. Попробуйте войти."
        : message.includes("rate limit")
          ? "Слишком много запросов. Попробуйте немного позже."
          : message.includes("fetch")
            ? "Не удалось связаться с Supabase. Проверьте интернет."
            : message;
export default function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
        return;
      }
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/tutor/`,
        });
        if (error) throw error;
        setMessage(
          "Если аккаунт существует, письмо для восстановления отправлено. Проверьте почту.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/tutor/` },
        });
        if (error) throw error;
        if (!data.session)
          setMessage(
            "Проверьте почту и подтвердите адрес. Затем войдите в аккаунт.",
          );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(translate((e as Error).message));
    } finally {
      setBusy(false);
    }
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
              : mode === "signup"
                ? "Начните свой путь"
                : mode === "reset"
                  ? "Восстановление доступа"
                  : "Рады вас видеть"}
          </h2>
          <p>
            {recovery
              ? "Задайте новый пароль для вашего аккаунта."
              : mode === "signin"
                ? "Войдите, чтобы продолжить обучение."
                : mode === "signup"
                  ? "Создайте аккаунт ученика. Роль преподавателя назначается администратором."
                  : "Введите email вашего аккаунта."}
          </p>
          {!configured ? (
            <ErrorBox message="Нужно подключить Supabase: заполните VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY из .env.example. Данные не сохраняются локально вместо базы." />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
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
              {(recovery || mode !== "reset") && (
                <Field
                  label="Пароль"
                  hint={
                    mode === "signup" || recovery
                      ? "Не менее 10 символов"
                      : undefined
                  }
                >
                  <input
                    type="password"
                    autoComplete={
                      mode === "signup" || recovery
                        ? "new-password"
                        : "current-password"
                    }
                    required
                    minLength={mode === "signup" || recovery ? 10 : 1}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
              {mode === "signin" && !recovery && (
                <button
                  className="text-btn forgot"
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setError("");
                    setMessage("");
                  }}
                >
                  Забыли пароль?
                </button>
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
                    : mode === "signin"
                      ? "Войти"
                      : mode === "signup"
                        ? "Создать аккаунт"
                        : "Отправить письмо"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {!recovery && (
            <div className="auth-switch">
              {mode === "signin" ? (
                <>
                  Ещё нет аккаунта?{" "}
                  <button
                    onClick={() => {
                      setMode("signup");
                      setError("");
                      setMessage("");
                    }}
                  >
                    Зарегистрироваться
                  </button>
                </>
              ) : (
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
              )}
            </div>
          )}
          <div className="auth-note">
            <ShieldCheck size={16} />
            <span>Один аккаунт Barkaloo. Прогресс хранится в Supabase.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

