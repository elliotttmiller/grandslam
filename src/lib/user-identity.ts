const USER_ID_KEY = 'gs_user_id';
const USER_NAME_KEY = 'gs_user_name';

/**
 * Returns a persistent, device-local user identifier.
 * Generated once using the Web Crypto API and stored in localStorage.
 */
export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    // Use the Web Crypto API for a cryptographically random UUID
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getUserName(): string {
  return localStorage.getItem(USER_NAME_KEY) ?? '';
}

export function setUserName(name: string): void {
  localStorage.setItem(USER_NAME_KEY, name.trim());
}
