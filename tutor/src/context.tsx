import { createContext, useContext } from "react";
import type { Data } from "./types";
export type AppContextType = {
  data: Data;
  preview: boolean;
  teacher: boolean;
  refresh: () => Promise<Data>;
  notify: (s: string) => void;
  navigate: (path: string) => void;
  setUnsaved: (dirty: boolean) => void;
};
export const AppContext = createContext<AppContextType | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("Missing app context");
  return ctx;
}
