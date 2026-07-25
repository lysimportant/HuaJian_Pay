import axios from 'axios'
import { clearToken, logoutAndRedirect } from '../utils/auth'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/admin/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  // Prefer shared auth helper key (admin_token); keep legacy hp_admin_token fallback
  const token =
    localStorage.getItem('admin_token') || localStorage.getItem('hp_admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Login wrong password is 401 — do not clear/redirect on login page or /login API
      const url = String(error?.config?.url || '')
      const onLogin =
        typeof window !== 'undefined' && window.location.pathname.includes('/login')
      const isLoginApi = url.includes('/login')
      if (!onLogin && !isLoginApi) {
        clearToken()
        logoutAndRedirect()
      }
    }
    return Promise.reject(error)
  },
)

/** Prefer server business msg; avoid axios stock "Request failed with status code N". */
export function pickMsg(error: any, fallback = '请求失败'): string {
  const data = error?.response?.data
  const server =
    (typeof data?.msg === 'string' && data.msg.trim()) ||
    (typeof data?.message === 'string' && data.message.trim()) ||
    (typeof data?.error?.message === 'string' && data.error.message.trim()) ||
    (typeof data?.error === 'string' && data.error.trim()) ||
    ''
  if (server) return server
  const raw = typeof error?.message === 'string' ? error.message.trim() : ''
  if (raw && !/^request failed with status code \d+$/i.test(raw) && raw !== 'Network Error') {
    if (!raw.startsWith('Request failed')) return raw
  }
  return fallback
}
