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
  ArrowUpRight,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import { loadData, supabase } from "./lib/api";
import type { Data } from "./types";
import { AppContext } from "./context";
import { Busy, ErrorBox } from "./components/ui";
import Auth from "./pages/Auth";
import { Catalog, SectionPage, Modules } from "./pages/Catalog";
import { Dashboard, Statistics } from "./pages/Overview";
import Settings from "./pages/Settings";
const Editor = lazy(() => import("./pages/Editor"));
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
  const teacher = data.role === "teacher" && !preview;
  const active = path.split("/")[0];
  const visibleNav = teacher
    ? nav.filter((n) => n.path !== "practice" && n.path !== "mistakes")
    : nav;
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
        return <Statistics />;
      case "settings":
        return <Settings />;
      default:
        return <Catalog />;
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
          <div className="sidebar-label">ВАШЕ ОБУЧЕНИЕ</div>
          <nav>
            {visibleNav.map(({ path: p, title, icon: Icon }) => (
              <button
                className={
                  active === p ||
                  (p === "catalog" && active === "section") ||
                  (p === "modules" && ["edit", "lesson"].includes(active))
                    ? "active"
                    : ""
                }
                key={p}
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
            <div className="ecosystem">
              <span className="sidebar-label">ВСЕЛЕННАЯ BARKALOO</span>
              <a href="https://barkaloo-web.vercel.app/">
                English <ArrowUpRight size={14} />
              </a>
              <a href="https://barkaloo-web.vercel.app/fitness/">
                Fit <ArrowUpRight size={14} />
              </a>
            </div>
            <button
              className={
                active === "settings" ? "settings-link active" : "settings-link"
              }
              onClick={() => navigate("settings")}
            >
              <SettingsIcon size={18} />
              Настройки
            </button>
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
              <PanelLeftClose size={17} className="desktop-only muted" />
              <span>
                Barkaloo <i>/</i> <strong>Tutor</strong>
              </span>
            </div>
            <div className="topbar-right">
              <span className="course-badge">
                <GraduationCap size={16} />
                ЕГЭ · Информатика
              </span>
              {data.role === "teacher" && (
                <button
                  className={`mode-switch ${preview ? "on" : ""}`}
                  onClick={mode}
                >
                  <Eye size={16} />
                  <span>
                    {preview ? "Вернуться к преподаванию" : "Режим ученика"}
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
                Просмотр от лица ученика · только опубликованные материалы ·
                тестовый прогресс сохраняется отдельно
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
          <footer className="app-footer">
            <span>Barkaloo Tutor</span>
            <span>Шаг за шагом, в своём ритме.</span>
          </footer>
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

