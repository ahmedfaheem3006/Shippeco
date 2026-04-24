import { api } from '../utils/apiClient';

export const settingsService = {
  /**
   * Get all settings — returns object { key: value, ... }
   */
  async getSettings(): Promise<any> {
    try {
      const result: any = await api.get('/settings');
      // result could be { success: true, data: { key1: val1, ... } }
      // or just { key1: val1, ... }
      const data = result?.data || result;
      return data;
    } catch (error) {
      console.warn('[Settings] Failed to load settings:', error);
      return {};
    }
  },

  /**
   * Save a single setting key-value pair via POST /settings
   * Backend expects: { key: string, value: string }
   */
  async saveSetting(key: string, value: string): Promise<any> {
    try {
      const result: any = await api.post('/settings', { key, value });
      return result?.data || result;
    } catch (error) {
      console.error('[Settings] Failed to save setting:', error);
      throw error;
    }
  },

  /**
   * Update multiple settings at once via PUT /settings
   * Backend expects: { settings: [{ key, value }, ...] }
   */
  async updateSettings(settings: Array<{ key: string; value: string }>): Promise<any> {
    try {
      const result: any = await api.put('/settings', { settings });
      return result?.data || result;
    } catch (error) {
      console.error('[Settings] Failed to update settings:', error);
      throw error;
    }
  },
};