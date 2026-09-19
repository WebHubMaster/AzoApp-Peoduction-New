import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeCtx = createContext(null);

// Mirrors the app-wide `azo_theme` key + `dark` class so the customer panel
// stays in sync with the rest of AzoApp while owning its own toggle UI.
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem("azo_theme") || "light");

  const apply = useCallback((t) => {
    const root = document.documentElement;
    const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    apply(theme);
    localStorage.setItem("azo_theme", theme);
  }, [theme, apply]);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 450);
    setTheme((m) => (m === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle, isDark: theme === "dark" }}>
      {children}
    </ThemeCtx.Provider>
  );
};

export const useTheme = () => useContext(ThemeCtx) || { theme: "light", toggle: () => {}, isDark: false };
