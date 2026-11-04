// Thin API client for the DayWave backend (FastAPI).
// Plain fetch, no extra dependencies. In `hybrid` mode the UI falls back to
// local demo behaviour whenever the backend is unreachable (network failure),
// while backend validation errors (401/409/422) are surfaced to the user.

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'
const API_MODE = import.meta.env.VITE_API_MODE || 'hybrid'

export const SESSION_KEY = 'daywave-session'

/** Backend reported a validation/auth/conflict problem (show it to the user). */
export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message || `API error ${status}`)
    this.status = status
    this.data = data
  }
}

/** Backend unreachable (connection refused, DNS, CORS, network down) — used to trigger local fallback. */
export class NetworkError extends Error {
  constructor(cause) {
    super('Backend is unreachable')
    this.cause = cause
  }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

function localSession({ email, name, tokens = null }) {
  const s = { email, name: name || email.split('@')[0], source: 'local' }
  if (tokens) Object.assign(s, tokens)
  return s
}

/**
 * Runs `fn`, and in hybrid mode returns `fallbackFn()` on network failure.
 * HTTP errors (401/409/422, ...) are always re-thrown — never masked by fallback.
 */
async function withFallback(fn, fallbackFn) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof NetworkError) {
      if (API_MODE === 'hybrid' && fallbackFn) return fallbackFn()
      throw err
    }
    throw err
  }
}

export function extractErrorMessage(err) {
  if (err instanceof NetworkError) return err.message
  if (err instanceof ApiError) return err.message
  return err?.message || 'Something went wrong. Please try again.'
}

async function request(path, { method = 'GET', body = undefined, token = null } = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch (cause) {
    throw new NetworkError(cause)
  }

  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = { detail: text } }
  }

  if (!res.ok) {
    const detail =
      (typeof data?.detail === 'string' && data.detail) ||
      firstDetailMessage(data?.detail) ||
      `Request failed (${res.status})`
    throw new ApiError(res.status, detail, data)
  }
  return data
}

function firstDetailMessage(detail) {
  if (Array.isArray(detail) && detail.length && detail[0]?.msg) return detail[0].msg
  return null
}

/* ---------- Endpoints ---------- */

/** POST /auth/login/email → {access_token, refresh_token, token_type} */
export async function loginEmail({ email, password }) {
  const data = await request('/auth/login/email', {
    method: 'POST',
    body: { email, password }
  })
  return { access_token: data.access_token, refresh_token: data.refresh_token }
}

/** POST /users → 201 {id, email}; 409 when the email is taken; 422 on weak password */
export async function registerUser({ email, password }) {
  return request('/users', { method: 'POST', body: { email, password } })
}

/** GET /users/ → {id, email} (requires Bearer access token) */
export async function getCurrentUser(accessToken) {
  return request('/users/', { token: accessToken })
}

/** POST /auth/refresh — refresh token goes in the Authorization header, NOT the body */
export async function refreshTokens(refreshToken) {
  const data = await request('/auth/refresh', { token: refreshToken })
  return { access_token: data.access_token, refresh_token: data.refresh_token }
}

/** POST /auth/logout — refresh token in the Authorization header */
export async function logout(refreshToken) {
  return request('/auth/logout', { token: refreshToken })
}

/** GET /health/live, GET /health/ready — liveness / readiness probes */
export async function healthCheck(kind = 'live') {
  return request(`/health/${kind}`)
}

/* ---------- High-level flows used by Auth.vue ---------- */

export function loginAndSaveSession({ email, password, name = '' }) {
  return withFallback(
    async () => {
      const tokens = await loginEmail({ email, password })
      const session = { email, name: name || email.split('@')[0], ...tokens, source: 'api' }
      setSession(session)
      return session
    },
    () => {
      setSession(localSession({ email, name }))
      return { local: true }
    }
  )
}

export function signupAndSaveSession({ email, password, name = '' }) {
  return withFallback(
    async () => {
      await registerUser({ email, password })
      const tokens = await loginEmail({ email, password })
      const session = { email, name: name || email.split('@')[0], ...tokens, source: 'api' }
      setSession(session)
      return session
    },
    () => {
      setSession(localSession({ email, name }))
      return { local: true }
    }
  )
}
