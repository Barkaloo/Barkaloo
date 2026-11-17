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
              }}
            >
              <X size={18} />
            </button>
          </div>
          <nav aria-label="Основные разделы">
            {visibleNav.map(({ path: p, title, icon: Icon }) => (
              <button
                className={
                  active === p ||
                  (p === "catalog" && active === "section") ||
                  (p === "modules" && ["edit", "lesson"].includes(active)) ||
                  (p === "students" && active === "student")
                    ? "active"
                    : ""
                }
                key={p}
                aria-current={
                  active === p || (p === "students" && active === "student")
                    ? "page"
                    : undefined
                }
                onClick={() => navigate(p)}
              >
                <Icon size={19} />
                <span>{title}</span>
                {p === "mistakes" &&
                  data.attempts.some((a) => a.status === "wrong") && (
                    <i className="nav-dot" />
                  )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {!teacher && (
              <button
                className={
                  active === "settings"
                    ? "settings-link active"
                    : "settings-link"
                }
                onClick={() => navigate("settings")}
              >
                <SettingsIcon size={18} />
                Настройки
              </button>
            )}
            <div className="sidebar-profile">
              <span className="avatar">
                {data.profile.display_name[0].toUpperCase()}
              </span>
              <div>
                <strong>{data.profile.display_name}</strong>
                <small>
                  {teacher
                    ? "Преподаватель"
                    : preview
                      ? "Режим ученика"
                      : "Ученик"}
                </small>
              </div>
              <button
                className="icon-btn"
                aria-label="Выйти из аккаунта"
                title="Выйти"
                onClick={signout}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-btn mobile-only"
                aria-label="Открыть меню"
                onClick={() => setSidebar(true)}
              >
                <Menu size={21} />
              </button>
              <span>{teacher ? "Кабинет преподавателя" : "ЕГЭ · Информатика"}</span>
            </div>
            <div className="topbar-right">
              <ThemeSwitch
                theme={data.profile.theme}
                onChange={async (theme) => {
                  try {
                    await api("profile", {
                      display_name: data.profile.display_name,
                      theme,
                    });
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              />
              {teacher && (
                <button
                  className="icon-btn"
                  aria-label="Настройки профиля"
                  title="Настройки профиля"
                  onClick={() => navigate("settings")}
                >
                  <SettingsIcon size={18} />
                </button>
              )}
              {data.role === "teacher" && (
                <button
                  className={`mode-switch ${preview ? "on" : ""}`}
                  aria-pressed={preview}
                  onClick={mode}
                >
                  <Eye size={16} />
                  <span>
                    {preview ? "К преподаванию" : "Режим ученика"}
                  </span>
                  <i />
                </button>
              )}
            </div>
          </header>
          {preview && (
            <div className="preview-banner">
              <Eye size={16} />
              <span>
                Предпросмотр ученика · тестовый прогресс сохраняется отдельно
              </span>
            </div>
          )}
          {offline && (
            <div className="offline-banner" role="alert">
              <WifiOff size={16} />
              Нет подключения. Для сохранения материалов и ответов нужен
              интернет.
            </div>
          )}
          <main className="main-content">
            <Suspense fallback={<Busy />}>{page()}</Suspense>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
            <button
              className="icon-btn"
              aria-label="Закрыть уведомление"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: string;
  onChange: (theme: "light" | "dark") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      className="icon-btn theme-switch"
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onChange(dark ? "light" : "dark");
        } finally {
          setBusy(false);
        }
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
