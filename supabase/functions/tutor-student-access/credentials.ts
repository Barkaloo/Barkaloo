const encoder = new TextEncoder();
const bytesToBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export function generateCode() {
  const buffer = new Uint32Array(1);
  // Rejection sampling avoids modulo bias; leading zeroes are significant.
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= 4294000000);
  return (buffer[0] % 1000000).toString().padStart(6, "0");
}
export async function fingerprint(
  secret: string,
  purpose: string,
  value: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${purpose}:${value}`),
    ),
  );
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function encryptionKey(secret: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`tutor-code-v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptCode(secret: string, code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(code),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(bytes))}`;
}
export async function decryptCode(secret: string, ciphertext: string) {
  const [iv, body] = ciphertext.split(".");
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(secret),
    fromBase64(body),
  );
  const code = new TextDecoder().decode(bytes);
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid credential");
  return code;
}
