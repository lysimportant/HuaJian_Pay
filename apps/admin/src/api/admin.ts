import { api } from './client'

export function login(username: string, password: string) {
  return api.post('/login', { username, password }) as Promise<any>
}

export function logout() {
  return api.post('/logout') as Promise<any>
}

export function fetchMe() {
  return api.get('/me') as Promise<any>
}

export function fetchOrders(params: Record<string, unknown>) {
  return api.get('/orders', { params }) as Promise<any>
}

export function fetchOrder(tradeNo: string) {
  return api.get(`/orders/${encodeURIComponent(tradeNo)}`) as Promise<any>
}

export function fetchAlipayChannel() {
  return api.get('/channels/alipay') as Promise<any>
}

export function updateAlipayChannel(body: Record<string, unknown>) {
  return api.put('/channels/alipay', body) as Promise<any>
}

export function fetchMerchants() {
  return api.get('/merchants') as Promise<any>
}

export function createMerchant(body: { name?: string; pid?: string }) {
  return api.post('/merchants', body) as Promise<any>
}
