import { api } from './client'

export type ApiOk<T = unknown> = { code: number; msg?: string } & T

export type MeUser = {
  id: number
  username: string
  role: string
  display_name: string | null
  status?: string
  created_at: string | null
  last_login_at: string | null
}

export type AdminUserRow = {
  id: number
  username: string
  role: string
  display_name: string | null
  status: string
  created_at: string | null
  last_login_at: string | null
}

export type AdminUserListQuery = {
  keyword?: string
  role?: string
  status?: string
}

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
  return api.post(
    `/orders/${encodeURIComponent(tradeNo)}/notify/resend`,
  ) as Promise<any>
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

export function fetchMerchants() {
  return api.get('/merchants') as Promise<any>
}

export function createMerchant(body: Record<string, unknown>) {
  return api.post('/merchants', body) as Promise<any>
}

export function updateMerchant(id: string | number, body: Record<string, unknown>) {
  return api.put(`/merchants/${id}`, body) as Promise<any>
}

/** GET /admin/api/me */
export function fetchMe() {
  return api.get('/me') as Promise<ApiOk<{ user: MeUser }>>
}

/** PUT /admin/api/me */
export function updateMe(body: { display_name?: string | null }) {
  return api.put('/me', body) as Promise<ApiOk<{ user: MeUser }>>
}

/** PUT /admin/api/me/password — current_password (server also accepts old_password) */
export function changeMyPassword(body: {
  current_password: string
  new_password: string
}) {
  return api.put('/me/password', body) as Promise<
    ApiOk<{ token?: string; user?: MeUser }>
  >
}

/** GET /admin/api/admin-users?keyword&role&status */
export function listAdminUsers(params?: AdminUserListQuery) {
  const q: Record<string, string> = {}
  if (params?.keyword?.trim()) q.keyword = params.keyword.trim()
  if (params?.role && params.role !== 'all') q.role = params.role
  if (params?.status && params.status !== 'all') q.status = params.status
  return api.get('/admin-users', { params: q }) as Promise<
    ApiOk<{ list: AdminUserRow[] }>
  >
}

/** POST /admin/api/admin-users — role only admin | viewer */
export function createAdminUser(body: {
  username: string
  password: string
  display_name?: string
  role?: 'admin' | 'viewer'
}) {
  return api.post('/admin-users', body) as Promise<ApiOk<{ user: AdminUserRow }>>
}

/** PATCH /admin/api/admin-users/:id */
export function patchAdminUser(
  id: number,
  body: {
    display_name?: string | null
    password?: string
    status?: 'active' | 'disabled'
    role?: 'admin' | 'viewer'
  },
) {
  return api.patch(`/admin-users/${id}`, body) as Promise<
    ApiOk<{ user: AdminUserRow }>
  >
}

/** DELETE /admin/api/admin-users/:id */
export function deleteAdminUser(id: number) {
  return api.delete(`/admin-users/${id}`) as Promise<ApiOk>
}

export function roleLabel(role: string | undefined | null): string {
  switch (role) {
    case 'admin':
      return '管理员'
    case 'viewer':
      return '普通用户'
    case 'super_admin':
      return '超级管理员'
    default:
      return role || '—'
  }
}

export function adminStatusLabel(status: string | undefined | null): string {
  switch (status) {
    case 'active':
      return '启用'
    case 'disabled':
      return '禁用'
    default:
      return status || '—'
  }
}
