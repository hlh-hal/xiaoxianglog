const PREFERRED_TEMPLATE_KEY = 'preferredTemplateId';
const LAST_THEME_KEY = 'lastUsedDiaryThemeId';
export const DAILY_ECHO_MUTED_DATE_KEY = 'daily_echo_float_muted_date';

export const editorPreferences = {
  getPreferredTemplateId(): string | null {
    return localStorage.getItem(PREFERRED_TEMPLATE_KEY);
  },

  setPreferredTemplateId(id: string): void {
    localStorage.setItem(PREFERRED_TEMPLATE_KEY, id);
  },

  clearPreferredTemplateId(): void {
    localStorage.removeItem(PREFERRED_TEMPLATE_KEY);
  },

  getLastThemeId(): string | null {
    return localStorage.getItem(LAST_THEME_KEY);
  },

  setLastThemeId(id: string): void {
    localStorage.setItem(LAST_THEME_KEY, id);
  },

  isDailyEchoMuted(dateKey: string): boolean {
    return localStorage.getItem(DAILY_ECHO_MUTED_DATE_KEY) === dateKey;
  },
};
