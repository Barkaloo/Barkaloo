import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Library,
  BookOpen,
  Target,
  RotateCcw,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Eye,
  GraduationCap,
  PanelLeftClose,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  CheckCircle2,
  WifiOff,
  Users,
  ClipboardList,
  CalendarDays,
  UserPlus,
} from "lucide-react";
import { api, loadData, supabase } from "./lib/api";
import type { Data } from "./types";
import { AppContext } from "./context";
import { Busy, ErrorBox } from "./components/ui";
import Auth from "./pages/Auth";
import StudentSetup from "./pages/StudentSetup";
import { Catalog, SectionPage, Modules } from "./pages/Catalog";
import { Dashboard, Statistics } from "./pages/Overview";
import Settings from "./pages/Settings";
const Editor = lazy(() => import("./pages/Editor"));
const Students = lazy(() =>
  import("./pages/Students").then((m) => ({ default: m.Students })),
);
const AddStudent = lazy(() =>
  import("./pages/Students").then((m) => ({ default: m.AddStudentPage })),
);
const StudentPage = lazy(() =>
  import("./pages/Students").then((m) => ({ default: m.StudentPage })),
);
const Connect = lazy(() =>
  import("./pages/Students").then((m) => ({ default: m.Connect })),
);
const HomeworkList = lazy(() =>
  import("./pages/Homework").then((m) => ({ default: m.HomeworkList })),
);
const HomeworkPage = lazy(() =>
  import("./pages/Homework").then((m) => ({ default: m.HomeworkPage })),
);
const Lessons = lazy(() => import("./pages/Lessons"));
const TeacherStatistics = lazy(() => import("./pages/TeacherStatistics"));
const Learning = lazy(() =>
  import("./pages/Learning").then((m) => ({ default: m.Lesson })),
);
const Practice = lazy(() =>
  import("./pages/Learning").then((m) => ({ default: m.Practice })),
);
const Mistakes = lazy(() =>
  import("./pages/Learning").then((m) => ({ default: m.Mistakes })),
);
const nav = [
  { path: "dashboard", title: "Главная", icon: LayoutDashboard },
  { path: "catalog", title: "Каталог ЕГЭ", icon: Library },
  { path: "modules", title: "Учебные модули", icon: BookOpen },
  { path: "practice", title: "Практика", icon: Target },
  { path: "mistakes", title: "Работа над ошибками", icon: RotateCcw },
  { path: "stats", title: "Статистика", icon: ChartNoAxesCombined },
];
const readPath = () =>
  location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authLoading, setAuthLoading] = useState(true),
    [recovery, setRecovery] = useState(false);
  const [data, setData] = useState<Data | null>(null),
    [preview, setPreview] = useState(
      () => sessionStorage.getItem("barkaloo-tutor-preview") === "true",
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [path, setPath] = useState(readPath),
    [sidebar, setSidebar] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine);
  const unsaved = useRef(false),
    sequence = useRef(0);
  const setUnsaved = useCallback((dirty: boolean) => {
    unsaved.current = dirty;
  }, []);
  const mayLeave = () =>
    !unsaved.current ||
    window.confirm(
      "В модуле есть несохранённые изменения. Продолжить без сохранения?",
    );
  const navigate = useCallback((next: string) => {
    if (!mayLeave()) return;
    unsaved.current = false;
    location.hash = `/${next}`;
    setPath(next);
    setSidebar(false);
    window.scrollTo(0, 0);
  }, []);
  const notify = useCallback((text: string) => setToast(text), []);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    const next = await loadData(preview);
    if (current === sequence.current) setData(next);
    return next;
  }, [preview]);
  useEffect(() => {
    if (!session) return;
    const update = () => {
      if (!unsaved.current && document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [session?.user.id, refresh]);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setData(null);
        setPreview(false);
        setRecovery(false);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) {
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void refresh()
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      sequence.current++;
    };
  }, [session?.user.id, refresh]);
  useEffect(() => {
    const change = () => {
      setPath(readPath());
      setSidebar(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    sessionStorage.setItem("barkaloo-tutor-preview", String(preview));
  }, [preview]);
  useEffect(() => {
    const theme = data?.profile.theme ?? "system";
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [data?.profile.theme]);
  if (authLoading) return <Busy text="Открываем Barkaloo Tutor…" />;
  if (!session || recovery)
    return (
      <Auth
        recovery={recovery}
        onRecovered={() => {
          setRecovery(false);
          notify("Пароль обновлён");
        }}
      />
    );
  if (loading || !data)
    return (
      <main className="initial-loading">
        <span className="brand-mark">
          b<span>.</span>
        </span>
        {error ? (
          <>
            <ErrorBox message={error} />
            <button
              className="btn primary"
              onClick={() => {
                setError("");
                setLoading(true);
                refresh()
                  .catch((e) => setError((e as Error).message))
                  .finally(() => setLoading(false));
              }}
            >
              Повторить подключение
            </button>
            <button
              className="text-btn"
              onClick={() => supabase.auth.signOut({ scope: "local" })}
            >
              Выйти
            </button>
          </>
        ) : (
          <Busy text="Загружаем ваши материалы…" />
        )}
      </main>
    );
  if (data.profile.onboarding_complete === false && !preview)
    return <StudentSetup onDone={refresh} />;
  const teacher = data.role === "teacher" && !preview;
  const active = path.split("/")[0];
  const visibleNav = teacher
    ? [
        nav[0],
        { path: "students", title: "Ученики", icon: Users },
        { path: "lessons", title: "Журнал занятий", icon: CalendarDays },
        { path: "student-new", title: "Добавить ученика", icon: UserPlus },
      ]
    : [
        ...nav.filter((n) => n.path !== "stats"),
        { path: "homework", title: "Домашние задания", icon: ClipboardList },
        nav.find((n) => n.path === "stats")!,
        { path: "connect", title: "Мои преподаватели", icon: UserPlus },
      ];
  const mode = () => {
    if (!mayLeave()) return;
    unsaved.current = false;
    setData(null);
    setLoading(true);
    setPreview((p) => !p);
    location.hash = "/dashboard";
    setPath("dashboard");
  };
  const signout = async () => {
    if (!mayLeave()) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) notify(error.message);
  };
  const page = () => {
    const [route, id] = path.split("/");
    switch (route) {
      case "dashboard":
        return <Dashboard />;
      case "catalog":
        return <Catalog />;
      case "section":
        return <SectionPage key={id} id={id} />;
      case "modules":
        return <Modules />;
      case "edit":
        return <Editor key={id} id={id} />;
      case "lesson":
        return <Learning key={id} id={id} />;
      case "practice":
        return <Practice key={id ?? "all"} taskId={id} />;
      case "mistakes":
        return <Mistakes />;
      case "stats":
        return teacher ? (
          <TeacherStatistics key={id ?? "all"} initialStudent={id} />
        ) : (
          <Statistics />
        );
      case "students":
        return <Students />;
      case "student-new":
        return <AddStudent />;
      case "student":
        return <StudentPage key={id} id={id} />;
      case "connect":
        return <Connect />;
      case "join":
        return <Connect key={id} initialCode={id} />;
      case "homework":
        return id ? <HomeworkPage key={id} id={id} /> : <HomeworkList />;
      case "homework-new":
        return teacher ? (
          <HomeworkList create studentId={id} />
        ) : (
          <HomeworkList />
        );
      case "lessons":
        return <Lessons />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };
  return (
    <AppContext.Provider
      value={{ data, preview, teacher, refresh, notify, navigate, setUnsaved }}
    >
      <div className={`app-shell ${preview ? "preview-mode" : ""}`}>
        {sidebar && (
          <button
            className="sidebar-shade"
            aria-label="Закрыть меню"
            onClick={() => setSidebar(false)}
          />
        )}
        <aside className={`sidebar ${sidebar ? "open" : ""}`}>
          <div className="brand">
            <button
              className="brand-home"
              onClick={() => navigate("dashboard")}
            >
              <span className="brand-mark">
                b<span>.</span>
              </span>
              <div>
                Barkaloo<span>Tutor</span>
              </div>
            </button>
            <button
              className="mobile-only icon-btn"
              aria-label="Закрыть меню"
              onClick={(e) => {
                e.stopPropagation();
                setSidebar(false);
   …18371 tokens truncated…     nickname: s.nickname,
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
export function Connect(_props: { initialCode?: string } = {}) {
  const { data, preview } = useApp();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Учитесь вместе</span>
          <h1>Мои преподаватели</h1>
          <p>Материалы и домашние работы от вашего преподавателя.</p>
        </div>
      </div>
      {preview ? (
        <p className="panel muted">
          В режиме просмотра показан ваш учебный интерфейс. Ученики входят в
          свои аккаунты по постоянному коду.
        </p>
      ) : data.teachers.length ? (
        <div className="student-grid">
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
      ) : (
        <Empty title="Преподаватель пока не подключён">
          Для входа в учебный кабинет получите шестизначный код у преподавателя.
        </Empty>
      )}
    </>
  );
}
