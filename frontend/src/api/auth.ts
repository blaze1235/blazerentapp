import api from './client'
import type { User } from '../types'

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

function mapUser(raw: any): User {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    balance: raw.balance ?? 0,
    tier: raw.tier ?? 'bronze',
    tgChatId: raw.tg_chat_id ?? undefined,
    language: raw.language ?? 'ru',
    isAdmin: raw.is_admin ?? false,
    createdAt: raw.created_at,
  }
}

export async function login(phone: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post('/auth/login', { phone, password })
  return { ...data, user: mapUser(data.user) }
}

export async function register(name: string, phone: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post('/auth/register', { name, phone, password })
  return { ...data, user: mapUser(data.user) }
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/auth/me')
  return mapUser(data)
}
