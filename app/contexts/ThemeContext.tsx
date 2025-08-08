import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Initialize theme from localStorage or default to system
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme;
    if (storedTheme && ['light', 'dark', 'system'].includes(storedTheme)) {
      setThemeState(storedTheme);
    }
  }, []);

  // Listen for system theme changes and update resolved theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateResolvedTheme = () => {
      const newResolvedTheme = theme === 'system' 
        ? (mediaQuery.matches ? 'dark' : 'light')
        : theme === 'dark' ? 'dark' : 'light';
      
      
      // Apply theme to document BEFORE setting state
      const htmlElement = document.documentElement;
      if (newResolvedTheme === 'dark') {
        htmlElement.classList.remove('light');
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
        htmlElement.classList.add('light');
      }
      
      setResolvedTheme(newResolvedTheme);
    };

    // Update immediately when theme changes
    updateResolvedTheme();
    
    // Listen for system changes only when theme is 'system'
    const handleSystemChange = () => {
      updateResolvedTheme();
    };

    if (theme === 'system') {
      mediaQuery.addEventListener('change', handleSystemChange);
    }
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}