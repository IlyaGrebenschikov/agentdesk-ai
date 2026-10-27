export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'member';
  avatar_url?: string | null;
}

export interface AuthSession {
  access_token: string;
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
const IS_API_MODE = (import.meta.env.VITE_API_MODE ?? 'mock') === 'api';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');

type MockUser = AuthUser & { password: string };

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

function safeWriteToStorage(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch { /* non-JSON error response */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeSession(payload: unknown): AuthSession {
  const data = payload as Partial<AuthSession> & { data?: Partial<AuthSession>; accessToken?: string };
  const session = data.data ?? data;
  const token = session.access_token ?? data.accessToken;
  if (!token || !session.user?.email) {
    throw new Error('Unexpected auth response. Expected access_token and user. Update src/api/auth.ts to match your API contract.');
  }
  return {
    access_token: token,
    token_type: 'bearer',
    user: {
      id: session.user.id ?? session.user.email,
      email: session.user.email,
      full_name: session.user.full_name ?? session.user.email.split('@')[0],
      role: session.user.role ?? 'owner',
      avatar_url: session.user.avatar_url ?? null,
    },
  };
}

export const authApi = {
  async signIn(email: string, password: string, remember = true): Promise<AuthSession> {
    const normalizedEmail = email.trim().toLowerCase();
    if (IS_API_MODE) {
      const response = await apiRequest<unknown>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }),
      });
      return storeSession(normalizeSession(response), remember);
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
    if (IS_API_MODE) {
      const response = await apiRequest<unknown>('/auth/register', { method: 'POST', body: JSON.stringify(normalized) });
      return storeSession(normalizeSession(response), remember);
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
    if (IS_API_MODE) {
      await apiRequest<void>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    // Deliberately return the same success shape for every email, like a real reset flow.
  },

  async signOut(): Promise<void> {
    if (IS_API_MODE && getAccessToken()) {
      try { await apiRequest<void>('/auth/logout', { method: 'POST', body: '{}' }); }
      catch { /* local logout must still work if server session is expired */ }
    }
    clearStoredSession();
  },
};
