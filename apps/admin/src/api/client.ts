import axios from 'axios'
import { clearToken, getToken, logoutAndRedirect } from '../utils/auth'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/admin/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
      logoutAndRedirect()
    }
    return Promise.reject(error)
  },
)

export function pickMsg(error: any, fallback = '请求失败'): string {
  return (
    error?.response?.data?.msg ||
    error?.response?.data?.error?.message ||
    error?.message ||
    fallback
  )
}
