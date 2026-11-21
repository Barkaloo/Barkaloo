type StorageLike = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export function createTabAuth(
  projectKey: string,
  storage: StorageLike | undefined,
  navigationType: string,
  documentId = crypto.randomUUID(),
) {
  const persistentKey = `${projectKey}-tab`;
  // Every document gets a separate SDK broadcast channel, even duplicated tabs.
  // The adapter retains a stable key in this tab so reloads can restore its login.
  const storageKey = `${persistentKey}:${documentId}`;
  const memory = new Map<string, string>();

  if (storage && navigationType !== "reload") {
    // Browsers can copy sessionStorage from an opener or duplicated tab. Starting
    // a fresh navigation discards that copy locally, without revoking its session.
    const inheritedKeys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === persistentKey || key?.startsWith(`${persistentKey}-`))
        inheritedKeys.push(key);
    }
    for (const key of inheritedKeys) storage.removeItem(key);
    storage.removeItem("barkaloo-tutor-preview");
  }

  const scopedKey = (key: string) => {
    if (!key.startsWith(storageKey))
      throw new Error("Unexpected Tutor auth storage key");
    return persistentKey + key.slice(storageKey.length);
  };
  return {
    storageKey,
    storage: {
      getItem: (key: string) =>
        storage
          ? storage.getItem(scopedKey(key))
          : (memory.get(scopedKey(key)) ?? null),
      setItem: (key: string, value: string) => {
        const target = scopedKey(key);
        if (storage) storage.setItem(target, value);
        else memory.set(target, value);
      },
      removeItem: (key: string) => {
        const target = scopedKey(key);
        if (storage) storage.removeItem(target);
        else memory.delete(target);
      },
    },
  };
}

export function browserTabAuth(projectKey: string) {
  let storage: StorageLike | undefined;
  if (typeof window !== "undefined") {
    try {
      storage = window.sessionStorage;
    } catch {
      /* Private browsers can deny storage; keep this document's login in memory. */
    }
  }
  const navigation =
    typeof performance !== "undefined"
      ? ((
          performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined
        )?.type ?? "navigate")
      : "navigate";
  return createTabAuth(projectKey, storage, navigation);
}
