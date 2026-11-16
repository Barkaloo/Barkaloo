import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "../types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!url && !!key && !url.includes("your-project");
export const supabase: SupabaseClient =
  import.meta.hot?.data.supabaseClient ??
  createClient(
    configured ? url : "https://unconfigured.supabase.co",
    configured ? key : "unconfigured",
    {
      auth: {
        storageKey: "barkaloo-tutor-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
if (import.meta.hot) import.meta.hot.data.supabaseClient = supabase;
export async function api<T = Record<string, unknown>>(
  action: string,
  payload: object = {},
): Promise<T> {
  const { data, error } = await supabase.rpc("tutor_api", {
    p_action: action,
    p: payload,
  });
  if (error) {
    if (error.code === "PGRST202")
      throw new Error(
        "База Tutor ещё не настроена. Примените миграцию из папки supabase/migrations.",
      );
    if (
      error.message === "Failed to fetch" ||
      error.message.includes("fetch failed")
    )
      throw new Error(
        "Нет связи с сервером. Проверьте подключение и повторите действие.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
export const loadData = async (preview: boolean) => {
  const data = await api<Data>("data", { preview });
  if (!Array.isArray(data.students) || !Array.isArray(data.homeworks))
    throw new Error(
      "Нужно применить миграцию второго этапа Tutor. Материалы и прогресс сохранены.",
    );
  return { ...data, student_progress: data.student_progress ?? [] };
};
export async function studentAccess<T>(
  action: string,
  payload: object = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "tutor-student-access",
    { body: { action, ...payload } },
  );
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
