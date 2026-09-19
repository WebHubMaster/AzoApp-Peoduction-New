/**
 * Web fallback for storage utilities (localStorage-backed).
 */
function get(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function set(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function remove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const storage = {
  async getItem(key: string) {
    return get(key);
  },
  async setItem(key: string, value: string) {
    set(key, value);
  },
  async removeItem(key: string) {
    remove(key);
  },
};

export const secureStorage = storage;
