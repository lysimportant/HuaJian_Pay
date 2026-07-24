const TOKEN_KEY = 'admin_token'
const USER_KEY = 'admin_username'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY)
}

export function setUsername(username: string): void {
  localStorage.setItem(USER_KEY, username)
}

export function setAuth(token: string, username?: string): void {
  setToken(token)
  if (username) setUsername(username)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function logoutAndRedirect(): void {
  clearToken()
  if (location.pathname !== '/login') {
    const redirect = encodeURIComponent(location.pathname + location.search)
    location.href = `/login?redirect=${redirect}`
  }
}
