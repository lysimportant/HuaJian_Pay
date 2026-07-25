import { api } from './client'

export function login(username: string, password: string) {
  return api.post('/login', { username, password }) as Promise<any>
}

export function fetchOrders(params: Record<string, unknown>) {
  return api.get('/orders', { params }) as Promise<any>
}

export function fetchOrder(tradeNo: string) {
  return api.get(`/orders/${encodeURIComponent(tradeNo)}`) as Promise<any>
}

export function resendNotify(tradeNo: string) {
  return api.post(`/orders/${encodeURIComponent(tradeNo)}/notify/resend`) as Promise<any>
}

export function fetchAlipayChannel() {
  return api.get('/channels/alipay') as Promise<any>
}

export function updateAlipayChannel(body: Record<string, unknown>) {
  return api.put('/channels/alipay', body) as Promise<any>
}

export function fetchWxpayChannel() {
  return api.get('/channels/wxpay') as Promise<any>
}

export function updateWxpayChannel(body: Record<string, unknown>) {
  return api.put('/channels/wxpay', body) as Promise<any>
}

/** Current admin profile (约定: GET /admin/profile → /admin/api/profile) */
export function fetchProfile() {
  return api.get('/profile') as Promise<any>
}

/** Update display name / username (约定: PUT /admin/profile) */
export function updateProfile(body: { username?: string; display_name?: string }) {
  return api.put('/profile', body) as Promise<any>
}

/** Change password (约定: PUT /admin/profile/password) */
export function changeProfilePassword(body: {
  old_password: string
  new_password: string
}) {
  return api.put('/profile/password', body) as Promise<any>
}

/** Admin users list (约定: GET /admin/users) */
export function fetchAdminUsers(params?: { page?: number; page_size?: number }) {
  return api.get('/users', { params }) as Promise<any>
}

export function fetchMerchants() {
  return api.get('/merchants') as Promise<any>
}

export function createMerchant(body: Record<string, unknown>) {
  return api.post('/merchants', body) as Promise<any>
}

export function updateMerchant(id: string | number, body: Record<string, unknown>) {
  return api.put(`/merchants/${id}`, body) as Promise<any>
}
