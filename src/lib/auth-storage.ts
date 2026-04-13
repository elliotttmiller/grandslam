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
