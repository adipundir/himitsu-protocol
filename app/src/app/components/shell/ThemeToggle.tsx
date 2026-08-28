"use client";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

/** Mirrors the inline init script in layout.tsx: light unless an explicit "dark" choice was
 *  saved. System prefers-color-scheme is never consulted — light is the hard default. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("himitsu.theme", next);
    } catch {
      // storage unavailable — theme still applies for this session via the DOM attribute
    }
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
      title="Toggle theme"
    >
      {mounted && theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
