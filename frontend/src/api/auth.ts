export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'member';
  avatar_url?: string | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  token_type: 'bearer';
  user: AuthUser;
}

export interface SignUpPayload {
  full_name: string;
  email: string;
  password: string;
}

const SESSION_KEY = 'agentdesk.auth.session.v1';
const USERS_KEY = 'agentdesk.auth.mock_users.v1';
// hybrid — real backend auth + mock workflow data; api — full backend; mock — local only.
export const usesBackendAuth = (import.meta.env.VITE_API_MODE ?? 'hybrid') !== 'mock';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');

type MockUser = AuthUser & { password: string };

type AuthPayload = Partial<AuthSession> & {
  accessToken?: string;
  data?: Partial<AuthSession> & { accessToken?: string };
};

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createDemoUser(): MockUser {
  return {
    id: 'usr_demo',
    email: 'demo@agentdesk.dev',
    password: 'demo1234',
    full_name: 'Demo Developer',
    role: 'owner',
  };
}

function getMockUsers(): MockUser[] {
  const users = safeRead<MockUser[]>(USERS_KEY);
  if (users?.length) return users;
  const seeded = [createDemoUser()];
  safeWrite(USERS_KEY, seeded);
  return seeded;
}

export function getStoredSession(): AuthSession | null {
  return safeRead<AuthSession>(SESSION_KEY) ?? safeReadFromSessionStorage<AuthSession>(SESSION_KEY);
}

function safeReadFromSessionStorage<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getStoredSession()?.access_token ?? null;
}

function storeSession(session: AuthSession, remember = true): AuthSession {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  safeWriteToStorage(remember ? localStorage : sessionStorage, SESSION_KEY, session);
  return session;
}

function storeUpdatedSession(session: AuthSession) {
  // Keep the session in whichever storage the user originally chose.
  const storage = localStorage.getItem(SESSION_KEY) !== null ? localStorage : sessionStorage;
  safeWriteToStorage(storage, SESSION_KEY, session);
}

function safeWriteToStorage(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

async function responseError(response: Response): Promise<string> {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json() as {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
    };
    if (Array.isArray(body.detail)) {
      message = body.detail.map((item) => item.msg ?? String(item)).join('; ');
    } else {
      message = body.detail ?? body.message ?? message;
    }
  } catch { /* non-JSON error response */ }
  return message;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await responseError(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function requestHeaders(init: RequestInit, token?: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };
}

async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders(init),
  });
  return parseResponse<T>(response);
}

function fetchWithAccessToken(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders(init, token ?? undefined),
  });
}

export async function authorizedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetchWithAccessToken(path, init);
  if (response.status === 401 && await refreshSession()) {
    response = await fetchWithAccessToken(path, init);
  }
  return parseResponse<T>(response);
}

let refreshPromise: Promise<AuthSession | null> | null = null;

export function refreshSession(): Promise<AuthSession | null> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function performRefresh(): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!session?.refresh_token) return null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: requestHeaders({}, session.refresh_token),
      body: '{}',
    });
  } catch {
    // Network failures should not destroy a still potentially valid local session.
    return null;
  }

  if (!response.ok) {
    clearStoredSession();
    return null;
  }

  const data = await response.json() as AuthPayload;
  const tokens = data.data ?? data;
  const accessToken = tokens.access_token ?? data.accessToken;
  if (!accessToken || !tokens.refresh_token) {
    clearStoredSession();
    return null;
  }

  const updated: AuthSession = {
    ...session,
    access_token: accessToken,
    refresh_token: tokens.refresh_token,
    token_type: 'bearer',
    user: tokens.user ? normalizeUser(tokens.user) : session.user,
  };
  storeUpdatedSession(updated);
  return updated;
}

async function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/users/`, {
    headers: requestHeaders({}, accessToken),
  });
  return parseResponse<AuthUser>(response);
}

function normalizeUser(user: Partial<AuthUser>): AuthUser {
  const email = user.email ?? '';
  return {
    id: user.id ?? email,
    email,
    full_name: user.full_name ?? (email ? email.split('@')[0] : 'User'),
    role: user.role ?? 'owner',
    avatar_url: user.avatar_url ?? null,
  };
}

async function normalizeSession(payload: unknown): Promise<AuthSession> {
  const data = payload as AuthPayload;
  const session = data.data ?? data;
  const token = session.access_token ?? data.accessToken;
  if (!token) {
    throw new Error('Unexpected auth response. Expected access_token. Update src/api/auth.ts to match your API contract.');
  }
  const user = session.user ?? await fetchCurrentUser(token);
  if (!user?.email) {
    throw new Error('Unexpected auth response. Expected user data. Update src/api/auth.ts to match your API contract.');
  }
  return {
    access_token: token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    user: normalizeUser(user),
  };
}

async function loginWithPassword(email: string, password: string, remember: boolean): Promise<AuthSession> {
  const response = await publicRequest<unknown>('/auth/login/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return storeSession(await normalizeSession(response), remember);
}

export const authApi = {
  async signIn(email: string, password: string, remember = true): Promise<AuthSession> {
    const normalizedEmail = email.trim().toLowerCase();
    if (usesBackendAuth) {
      return loginWithPassword(normalizedEmail, password, remember);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 420));
    const user = getMockUsers().find((item) => item.email.toLowerCase() === normalizedEmail && item.password === password);
    if (!user) throw new Error('The email or password is incorrect.');
    const { password: _password, ...publicUser } = user;
    void _password;
    return storeSession({ access_token: `mock.${user.id}.${Date.now()}`, token_type: 'bearer', user: publicUser }, remember);
  },

  async signUp(payload: SignUpPayload, remember = true): Promise<AuthSession> {
    const normalized = { ...payload, email: payload.email.trim().toLowerCase(), full_name: payload.full_name.trim() };
    if (usesBackendAuth) {
      await publicRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ email: normalized.email, password: normalized.password }),
      });
      return loginWithPassword(normalized.email, normalized.password, remember);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 540));
    const users = getMockUsers();
    if (users.some((user) => user.email.toLowerCase() === normalized.email)) {
      throw new Error('An account with this email already exists.');
    }
    const user: MockUser = {
      id: `usr_${Math.random().toString(36).slice(2, 9)}`,
      email: normalized.email,
      password: normalized.password,
      full_name: normalized.full_name,
      role: 'owner',
    };
    safeWrite(USERS_KEY, [...users, user]);
    const { password: _password, ...publicUser } = user;
    void _password;
    return storeSession({ access_token: `mock.${user.id}.${Date.now()}`, token_type: 'bearer', user: publicUser }, remember);
  },

  async requestPasswordReset(email: string): Promise<void> {
    void email;
    // No backend endpoint yet: keep the local simulation in every mode.
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    // Deliberately return the same success shape for every email, like a real reset flow.
  },

  async signOut(): Promise<void> {
    if (usesBackendAuth) {
      const refreshToken = getStoredSession()?.refresh_token;
      if (refreshToken) {
        try {
          await publicRequest<void>('/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${refreshToken}` },
            body: '{}',
          });
        } catch { /* local logout must still work if server session is expired */ }
      }
    }
    clearStoredSession();
  },
};
