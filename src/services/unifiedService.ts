import { api } from '../utils/apiClient';

export const unifiedService = {
  _cache: new Map<string, { data: any; ts: number }>(),
  _CACHE_TTL: 30_000,

  _getCached<T>(key: string): T | null {
    const entry = this._cache.get(key);
    if (entry && Date.now() - entry.ts < this._CACHE_TTL) {
      return entry.data as T;
    }
    if (entry) this._cache.delete(key);
    return null;
  },

  _setCache(key: string, data: any) {
    this._cache.set(key, { data, ts: Date.now() });
  },

  invalidateCache(keyPrefix?: string) {
    if (!keyPrefix) { this._cache.clear(); return; }
    for (const k of this._cache.keys()) {
      if (k.startsWith(keyPrefix)) this._cache.delete(k);
    }
  },

  async get<T>(endpoint: string, _fallbackFn?: () => Promise<T>): Promise<T> {
    const cached = this._getCached<T>(endpoint);
    if (cached !== null) return cached;

    const result = await api.get(endpoint);
    this._setCache(endpoint, result);
    return result as T;
  },

  async getFromRailway<T>(endpoint: string, _fallbackFn?: () => Promise<T>): Promise<T> {
    return this.get<T>(endpoint);
  },

  async post<T>(endpoint: string, body: any): Promise<T> {
    this.invalidateCache();
    return await api.post(endpoint, body) as T;
  },

  async put<T>(endpoint: string, body: any): Promise<T> {
    this.invalidateCache();
    return await api.put(endpoint, body) as T;
  },

  async patch<T>(endpoint: string, body: any): Promise<T> {
    this.invalidateCache();
    return await api.patch(endpoint, body) as T;
  },

  async delete<T>(endpoint: string): Promise<T> {
    this.invalidateCache();
    return await api.delete(endpoint) as T;
  },

  getStatus() {
    return {
      railwayHealthy: true,
      railwayLastFailure: null,
      railwayCooldownRemaining: 0,
      cfHealthy: false,
      cfLastFailure: null,
      cfCooldownRemaining: 0,
    };
  }
};