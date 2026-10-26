// Theme manager for ProxiSpeak

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem("proxispeak-theme");
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
    localStorage.setItem("proxispeak-theme", effectiveTheme);
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
  }
  return effectiveTheme;
}

export function initTheme() {
  const saved = getSavedTheme();
  applyTheme(saved);
}
