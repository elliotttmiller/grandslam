/**
 * Auth-scoped localStorage helper.
 * 
 * Automatically scopes all storage keys to the current authenticated user's UID.
 * When no user is authenticated, uses a device-local scope.
 * This prevents cache collision when multiple users sign in on the same device.
 */

let currentAuthUserId: string | null = null;

export function setAuthStorageUserId(userId: string | null): void {
  currentAuthUserId = userId;
}

function scopeKey(key: string): string {
  // If user is authenticated, scope storage to their UID
  // Otherwise use device-local scope (no prefix)
  return currentAuthUserId ? `${key}_auth_${currentAuthUserId}` : key;
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
