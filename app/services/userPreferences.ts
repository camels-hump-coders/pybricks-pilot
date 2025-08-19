/**
 * User preferences stored in LocalStorage
 * This includes active selections and UI preferences that should persist
 * but don't need to be part of the user's project files
 */

interface UserPreferences {
  activeRobotId: string | null;
  activeMatId: string | null;
  // Add other preferences as needed
  theme?: "light" | "dark" | "system";
  lastDirectoryPath?: string;
}

const PREFERENCES_KEY = "pybricks-pilot-preferences";

class UserPreferencesService {
  private defaultPreferences: UserPreferences = {
    activeRobotId: null,
    activeMatId: null,
  };

  // Load preferences from localStorage
  getPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...this.defaultPreferences, ...parsed };
      }
    } catch (error) {
      console.warn("Failed to load user preferences from localStorage:", error);
    }
    return { ...this.defaultPreferences };
  }

  // Save preferences to localStorage
  setPreferences(preferences: Partial<UserPreferences>): void {
    try {
      const current = this.getPreferences();
      const updated = { ...current, ...preferences };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.warn("Failed to save user preferences to localStorage:", error);
    }
  }

  // Specific getters/setters for common preferences
  getActiveRobotId(): string | null {
    return this.getPreferences().activeRobotId;
  }

  setActiveRobotId(robotId: string | null): void {
    this.setPreferences({ activeRobotId: robotId });
  }

  getActiveMatId(): string | null {
    return this.getPreferences().activeMatId;
  }

  setActiveMatId(matId: string | null): void {
    this.setPreferences({ activeMatId: matId });
  }

  // Clear all preferences (useful for reset/debugging)
  clearPreferences(): void {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      console.warn("Failed to clear user preferences:", error);
    }
  }
}

export const userPreferences = new UserPreferencesService();
