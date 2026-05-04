import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-xl transition-all duration-200 active:scale-95 theme-icon-btn"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}