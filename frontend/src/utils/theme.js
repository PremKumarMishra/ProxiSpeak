// Theme manager for ProxiSpeak

const THEME_STORAGE_KEY = "proxispeak-theme";
export const THEME_EVENT = "proxispeak-theme-change";

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      return saved;
    }
    return "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  const effectiveTheme = theme === "dark" ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
  } catch {
    // Ignore storage errors
  }

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    if (effectiveTheme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
    try {
      window.dispatchEvent(
        new CustomEvent(THEME_EVENT, { detail: { theme: effectiveTheme } })
      );
    } catch {
      // Ignore event errors in older environments
    }
  }
  return effectiveTheme;
}

export function toggleTheme() {
  const current = getSavedTheme();
  const next = current === "dark" ? "light" : "dark";
  return applyTheme(next);
}

export function initTheme() {
  const saved = getSavedTheme();
  return applyTheme(saved);
}
