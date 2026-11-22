import { createClient, navigatorLock, type SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "../types";
import { browserTabAuth, hasRememberedTeacher, selectAuthAudience, teacherSessionKey } from "./tab-auth";
const url = import.meta.env.VITE_TUTOR_SUPABASE_URL;
const key = import.meta.env.VITE_TUTOR_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!url && !!key && !url.includes("your-project");
const projectKey = `barkaloo-tutor-${configured ? new URL(url).hostname.split(".")[0] : "unconfigured"}-auth`;
export const authAudience = selectAuthAudience(
  new URLSearchParams(location.search).get("role"), location.hash, hasRememberedTeacher(projectKey),
);
const authMode = `role-v2:${authAudience}`;
const cabinetFetch: typeof fetch = (input, init) => {
  if (typeof input === "string" && url && input === `${url.replace(/\/$/, "")}/rest/v1/rpc/tutor_api`) {
    // Use the same endpoint as code sign-in, including its URL for preflight.
    return fetch(`${url.replace(/\/$/, "")}/functions/v1/tutor-student-access`, init);
  }
  return fetch(input, init);
};
export const supabase: SupabaseClient =
  (import.meta.hot &&
  import.meta.hot.data.supabaseClientUrl === url &&
  import.meta.hot.data.supabaseClientMode === authMode
    ? import.meta.hot.data.supabaseClient
    : undefined) ??
  createClient(
    configured ? url : "https://unconfigured.supabase.co",
    configured ? key : "unconfigured",
    {
      ...(window.location.origin === "https://barkaloo88.sourcecraft.site"
        ? { global: { fetch: cabinetFetch } }
        : {}),
      auth: {
        ...(authAudience === "teacher"
          ? { storageKey: teacherSessionKey(projectKey), ...(navigator.locks ? { lock: navigatorLock } : {}) }
          : browserTabAuth(projectKey)),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
if (import.meta.hot) {
  import.meta.hot.data.supabaseClient = supabase;
  import.meta.hot.data.supabaseClientUrl = url;
  import.meta.hot.data.supabaseClientMode = authMode;
}
export async function api<T = Record<string, unknown>>(
  action: string,
  payload: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const request = supabase.rpc("tutor_api", {
    p_action: action,
    p: payload,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (signal?.aborted)
    throw new Error("Сервер долго не отвечает. Проверьте подключение и повторите попытку.");
  if (error) {
    if (error.code === "PGRST202")
      throw new Error(
        "База Tutor ещё не настроена. Примените миграцию из папки supabase/migrations.",
      );
    if (
      /failed to fetch|fetch failed|networkerror|load failed/i.test(error.message)
    )
      throw new Error(
        "Нет связи с сервером. Проверьте подключение и повторите действие.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
export const loadData = async (preview: boolean) => {
  // Stop waiting for a stalled read and let the cabinet reconnect.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  const data = await api<Data>("data", { preview }, controller.signal)
    .finally(() => window.clearTimeout(timer));
  if (!Array.isArray(data.students) || !Array.isArray(data.homeworks))
    throw new Error(
      "Нужно применить миграцию второго этапа Tutor. Материалы и прогресс сохранены.",
    );
  return { ...data, student_notes: data.student_notes ?? [], student_progress: data.student_progress ?? [] };
};
export async function studentAccess<T>(
  action: string,
  payload: object = {},
): Promise<T> {
  const invoke = () =>
    supabase.functions.invoke("tutor-student-access", {
      body: { action, ...payload },
      timeout: 20000,
    });
  let result = await invoke();
  // Retry only operations that preserve identity on replay. Rotation and access
  // changes require an explicit action if their response was lost.
  const transient =
    result.error?.name === "FunctionsFetchError" ||
    [502, 503, 504].includes(result.error?.context?.status);
  if (transient && ["login", "create", "show"].includes(action)) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    result = await invoke();
  }
  const { data, error } = result;
  if (error) {
    let message = "Не удалось связаться с сервером. Повторите попытку.";
    if (error.context && typeof error.context.json === "function") {
      const detail = await error.context.json().catch(() => null);
      if (typeof detail?.error === "string") message = detail.error;
      if (typeof detail?.retry_after === "number")
        message += ` Повторить можно через ${Math.ceil(detail.retry_after / 60)} мин.`;
    }
    console.warn(
      "Tutor access request failed",
      error.name,
      error.context?.status ?? "network",
    );
    throw new Error(message);
  }
  return data as T;
}
export async function uploadImage(moduleId: string, file: File) {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Изображение должно быть меньше 8 МБ");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      ? ["image/png", "png"]
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? ["image/jpeg", "jpg"]
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? ["image/webp", "webp"]
          : String.fromCharCode(...bytes.slice(0, 3)) === "GIF"
            ? ["image/gif", "gif"]
            : null;
  if (!mime) throw new Error("Поддерживаются PNG, JPEG, WebP и GIF");
  const path = `${moduleId}/${crypto.randomUUID()}.${mime[1]}`;
  const { error } = await supabase.storage
    .from("tutor-images")
    .upload(path, file, { contentType: mime[0], upsert: false });
  if (error)
    throw new Error(`Не удалось загрузить изображение: ${error.message}`);
  return path;
}
export function videoEmbed(
  input: string,
): { embed?: string; video?: string } | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:") return null;
    if (
      [
        "www.youtube.com",
        "youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(u.hostname)
    ) {
      const id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : (u.searchParams.get("v") ?? u.pathname.split("/").at(-1));
      return id && /^[\w-]{11}$/.test(id)
        ? { embed: `https://www.youtube-nocookie.com/embed/${id}` }
        : null;
    }
    if (["vimeo.com", "player.vimeo.com"].includes(u.hostname)) {
      const id = u.pathname.split("/").at(-1);
      return id && /^\d+$/.test(id)
        ? { embed: `https://player.vimeo.com/video/${id}` }
        : null;
    }
    if (/\.(mp4|webm)$/i.test(u.pathname)) return { video: u.href };
  } catch {
    /* invalid URL */
  }
  return null;
}
export const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      })
    : "Ещё не было";
export function answerLabel(
  value: unknown,
  task: Pick<import("../types").Task, "options">,
) {
  const labels = (Array.isArray(value) ? value : [value]).map(
    (v) => task.options?.find((o) => o.id === v)?.label ?? String(v ?? ""),
  );
  return labels.join(", ");
}
