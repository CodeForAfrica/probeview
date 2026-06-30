"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";

// The boot script applies the theme to <html> before hydration, so the DOM
// attribute is the source of truth. We subscribe to it as an external store
// rather than mirroring it into effect-driven state.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// Null on the server (and during hydration) so the icon stays neutral until the
// real, boot-script-applied theme is known — avoids a wrong-icon flash.
function getServerSnapshot(): null {
  return null;
}

function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {}
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
    >
      {/* Render nothing distinguishable until mounted to avoid a flash. */}
      {theme === "dark" ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
