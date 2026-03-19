import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "gtmx-unlocked";
const PASSWORD = "GTMx";

function readIsUnlockedFromSessionStorage() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function usePasswordAuth() {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return readIsUnlockedFromSessionStorage();
  });

  const unlock = useCallback((password: string) => {
    if (password !== PASSWORD) return false;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // If storage is unavailable, keep app functional for this session state.
    }
    setIsUnlocked(true);
    return true;
  }, []);

  const lock = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    setIsUnlocked(false);
  }, []);

  return useMemo(
    () => ({
      isUnlocked,
      unlock,
      lock,
    }),
    [isUnlocked, unlock, lock],
  );
}

