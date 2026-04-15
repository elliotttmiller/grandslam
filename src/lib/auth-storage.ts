/**
 * Auth-scoped localStorage helper.
 * 
 * Automatically scopes all storage keys to the current authenticated user's UID.
 * Each authenticated user gets their own isolated namespace, preventing cache
 * collision when multiple users sign in on the same device.
 * 
 * When no user is authenticated (signed out), a _guest namespace is used so
 * that signed-out state never leaks previously-authenticated users' cached data.
 */

let currentAuthUserId: string | null = null;

export function setAuthStorageUserId(userId: string | null): void {
  currentAuthUserId = userId;
}

/** Returns the UID that is currently scoping all storage operations. */
export function getCurrentAuthUserId(): string | null {
  return currentAuthUserId;
}

/**
 * Collect every localStorage entry that lives in the given namespace
 * (`userId = null` → `_guest`, otherwise `_auth_<userId>`) and remove
 * those keys from localStorage.  Returns a map of base-key → raw value.
 *
 * Call this *before* switching to a new authenticated namespace so that
 * any data the user created in the old namespace can be migrated without
 * loss.
 */
export function collectAndClearScopedData(userId: string | null): Record<string, string> {
  const suffix = userId ? `_auth_${userId}` : '_guest';
  const collected: Record<string, string> = {};
  const toRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith(suffix)) {
      const baseKey = key.slice(0, -suffix.length);
      const value = localStorage.getItem(key);
      if (value !== null) collected[baseKey] = value;
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    localStorage.removeItem(key);
  }

  return collected;
}

function scopeKey(key: string): string {
  if (currentAuthUserId) {
    // Authenticated: scope to this user's UID
    return `${key}_auth_${currentAuthUserId}`;
  }
  // Signed out: use a separate guest namespace — never bleed into any user's data
  return `${key}_guest`;
}

export function authGetItem(key: string): string | null {
  return localStorage.getItem(scopeKey(key));
}

export function authSetItem(key: string, value: string): void {
  localStorage.setItem(scopeKey(key), value);
}

export function authRemoveItem(key: string): void {
  localStorage.removeItem(scopeKey(key));
}
