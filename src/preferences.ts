export type Preferences = {
  locale: "zh-CN" | "en";
  zoom: 1 | 1.5 | 2 | 3;
  speed: 20 | 40 | 100 | 240;
};

export type PreferencesStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  locale: "zh-CN",
  zoom: 1,
  speed: 40,
});

const PREFERENCES_KEY = "pathfinder-arena:preferences";
const MAX_PREFERENCES_LENGTH = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recover each setting separately so one corrupt field loses no valid choices. */
function normalize(value: unknown): Preferences {
  if (!isRecord(value)) return { ...DEFAULT_PREFERENCES };
  return {
    locale: value.locale === "en" ? "en" : "zh-CN",
    zoom:
      value.zoom === 1.5 || value.zoom === 2 || value.zoom === 3
        ? value.zoom
        : 1,
    speed:
      value.speed === 20 || value.speed === 100 || value.speed === 240
        ? value.speed
        : 40,
  };
}

export function loadPreferences(storage: PreferencesStorage): Preferences {
  try {
    const text = storage.getItem(PREFERENCES_KEY);
    if (typeof text !== "string" || text.length > MAX_PREFERENCES_LENGTH) {
      return { ...DEFAULT_PREFERENCES };
    }
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.version !== 1) {
      return { ...DEFAULT_PREFERENCES };
    }
    return normalize(value);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  storage: PreferencesStorage,
  preferences: Preferences,
): boolean {
  try {
    storage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ version: 1, ...normalize(preferences) }),
    );
    return true;
  } catch {
    return false;
  }
}
