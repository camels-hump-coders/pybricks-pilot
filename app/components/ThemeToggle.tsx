import { useTheme } from "../contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: "system", label: "System", icon: "💻" },
    { value: "light", label: "Light", icon: "☀️" },
    { value: "dark", label: "Dark", icon: "🌙" },
  ] as const;

  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={theme}
        onChange={(e) => {
          setTheme(e.target.value as "light" | "dark" | "system");
        }}
        className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1 pr-8 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        {themes.map((themeOption) => (
          <option key={themeOption.value} value={themeOption.value}>
            {themeOption.icon}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
        <svg
          className="h-3 w-3 fill-current"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <title>Dropdown</title>
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  );
}
