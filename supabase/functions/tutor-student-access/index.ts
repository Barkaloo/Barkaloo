import { createClient } from "@supabase/supabase-js";
import {
  generateCode,
  fingerprint,
  encryptCode,
  decryptCode,
} from "./credentials.ts";

const origins = new Set([
  "https://barkaloo-tutor.vercel.app",
  "https://barkaloo-tutor-ruddy.vercel.app",
  "https://barkaloo88.sourcecraft.site",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
type RecordData = {
  student_id: string;
  ciphertext?: string;
  version?: number;
  enabled?: boolean;
  collision?: boolean;
  allowed?: boolean;
  retry_after?: number;
  secret?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, content-profile, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const response = (
    value: unknown,
    status = 200,
    extra: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { ...headers, ...extra },
    });
  if (origin && !origins.has(origin))
    return response({ error: "Этот адрес платформы не разрешён" }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return response({ error: "Метод не поддерживается" }, 405);
  const limit = 2 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return response({ message: "Слишком большой запрос" }, 413);
  try {
    const raw = await request.text();
    if (raw.length > limit)
      return response({ message: "Слишком большой запрос" }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const legacyCabinet = new URL(request.url).searchParams.get("route") === "cabinet";
    if (legacyCabinet || (typeof body.p_action === "string" && !("action" in body))) {
      const authorization = request.headers.get("authorization");
      if (!authorization) return response({ message: "Войдите в аккаунт" }, 401);
      // Keep the caller's identity and all existing database access checks.
      try {
        const upstream = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/tutor_api`, {
          method: "POST",
          headers: {
            authorization,
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
            "content-type": "application/json",
          },
          body: raw,
          redirect: "error",
          signal: AbortSignal.timeout(25_000),
        });
        return new Response(upstream.body, { status: upstream.status, headers });
      } catch {
        return response({ message: "Нет связи с сервером кабинета. Повторите попытку." }, 502);
      }
    }
    if (raw.length > 8192)
      return response({ error: "Слишком большой запрос" }, 413);
    const action = String(body.action ?? "");
    if (!["login", "create", "show", "rotate", "enabled"].includes(action))
      return response({ error: "Неизвестное действие" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!,
      serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Fresh clients per request: a student session must never replace admin auth.
    const admin = createClient(url, serviceKey, options);
    const gateway = async (
      name: string,
      p: object = {},
    ): Promise<RecordData> => {
      const { data, error } = await admin.rpc("tutor_code_gateway", {
        p_action: name,
        p,
      });
      if (error) throw error;
      return data as RecordData;
    };
    let actorId: string | undefined;
    if (action !== "login") {
      const bearer =
        request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user)
        return response({ error: "Войдите в аккаунт преподавателя" }, 401);
      actorId = data.user.id;
    }
    const secret = (await gateway("config")).secret!;
    const publicRecord = async (record: RecordData) => ({
      student_id: record.student_id,
      code: await decryptCode(secret, record.ciphertext!),
      version: record.version,
      enabled: record.enabled,
    });
    if (action === "login") {
      const code = String(body.code ?? "").replace(/\s/g, "");
      if (!/^\d{6}$/.test(code))
        return response({ error: "Введите шестизначный код" }, 400);
      const codeHash = await fingerprint(secret, "code", code);
      const network = (
        request.headers.get("x-forwarded-for")?.split(",")[0] ??
        request.headers.get("x-real-ip") ??
        "unknown"
      )
        .trim()
        .slice(0, 100);
      const claim = await gateway("login", {
        code_hash: codeHash,
        network_hash: await fingerprint(secret, "network", network),
      });
      if (claim.retry_after)
        return response(
          {
            error: "Слишком много попыток. Попробуйте позже.",
            retry_after: claim.retry_after,
          },
          429,
          { "Retry-After": String(claim.retry_after) },
        );
      if (!claim.allowed)
        return response(
          {
            error:
              "Код не найден или доступ закрыт. Проверьте код у преподавателя.",
          },
          401,
        );
      const { data: userData, error: userError } =
        await admin.auth.admin.getUserById(claim.student_id);
      if (userError || !userData.user?.email)
        throw new Error("Account missing");
      // generateLink does not send an email. Its token never leaves this function.
      const { data: link, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: userData.user.email,
        });
      if (linkError || !link.properties?.hashed_token)
        throw new Error("Session generation failed");
      const authClient = createClient(url, publicKey, options);
      const { data: login, error: loginError } =
        await authClient.auth.verifyOtp({
          token_hash: link.properties.hashed_token,
          type: "email",
        });
      if (loginError || !login.session)
        throw new Error("Session verification failed");
      const payload = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(
            atob(
              login.session.access_token
                .split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/"),
            ),
            (c) => c.charCodeAt(0),
          ),
        ),
      ) as { session_id: string };
      const confirm = await gateway("confirm", {
        student_id: claim.student_id,
        code_hash: codeHash,
        version: claim.version,
        session_id: payload.session_id,
      });
      if (!confirm.allowed) {
        await authClient.auth.signOut({ scope: "local" });
        return response(
          { error: "Код изменён или доступ закрыт. Войдите заново." },
          401,
        );
      }
      return response({
        access_token: login.session.access_token,
        refresh_token: login.session.refresh_token,
      });
    }
    if (action === "create") {
      if (!uuid.test(String(body.request_id ?? "")))
        return response({ error: "Обновите форму добавления ученика" }, 400);
      const nickname = String(body.nickname ?? "").trim();
      if (nickname.length > 100)
        return response({ error: "Имя слишком длинное" }, 400);
      const prepared = await gateway("prepare", {
        actor_id: actorId,
        request_id: body.request_id,
      });
      if (prepared.ciphertext) return response(await publicRecord(prepared));
      const { data: existing } = await admin.auth.admin.getUserById(
        prepared.student_id,
      );
      if (!existing.user) {
        const { error } = await admin.auth.admin.createUser({
          id: prepared.student_id,
          email: `tutor-student-${prepared.student_id}@accounts.barkaloo.invalid`,
          password: crypto.randomUUID() + crypto.randomUUID(),
          email_confirm: true,
          app_metadata: { tutor_code: true },
        });
        if (error) throw error;
      }
      for (let i = 0; i < 12; i++) {
        const code = generateCode();
        const saved = await gateway("finish", {
          actor_id: actorId,
          student_id: prepared.student_id,
          request_id: body.request_id,
          nickname,
          code_hash: await fingerprint(secret, "code", code),
          ciphertext: await encryptCode(secret, code),
        });
        if (!saved.collision) return response(await publicRecord(saved));
      }
      throw new Error("Credential allocation failed");
    }
    if (!uuid.test(String(body.student_id ?? "")))
      return response({ error: "Ученик недоступен" }, 400);
    if (action === "rotate") {
      for (let i = 0; i < 12; i++) {
        const code = generateCode();
        const saved = await gateway("rotate", {
          actor_id: actorId,
          student_id: body.student_id,
          version: body.version,
          code_hash: await fingerprint(secret, "code", code),
          ciphertext: await encryptCode(secret, code),
        });
        if (!saved.collision) return response(await publicRecord(saved));
      }
      throw new Error("Credential allocation failed");
    }
    if (action === "enabled" && typeof body.enabled !== "boolean")
      return response({ error: "Проверьте настройку доступа" }, 400);
    return response(
      await publicRecord(
        await gateway(action, {
          actor_id: actorId,
          student_id: body.student_id,
          enabled: body.enabled,
        }),
      ),
    );
  } catch (error) {
    // Never log codes, request bodies, service keys or sessions.
    if (
      (error as { message?: string }).message ===
      "Код уже изменён. Откройте карточку заново"
    )
      return response(
        { error: "Код уже изменён. Откройте карточку заново" },
        409,
      );
    const denied = (error as { code?: string }).code === "42501";
    return response(
      {
        error: denied
          ? "Действие доступно только преподавателю этого ученика"
          : "Не удалось выполнить действие. Повторите попытку.",
      },
      denied ? 403 : 500,
    );
  }
});
