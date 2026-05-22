import api from './client'
import type { AdminClient, AdminDashboard, AdminTopup, AdminActiveSession } from '../types'

function mapClient(raw: any): AdminClient {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    balance: raw.balance,
    sessions: raw.sessions,
    totalSpent: raw.total_spent,
    lastActive: raw.last_active,
    tgChatId: raw.tg_chat_id ?? undefined,
    tier: raw.tier,
    language: raw.language,
  }
}

function mapDashboard(raw: any): AdminDashboard {
  return {
    totalClients: raw.total_clients,
    activeSessions: raw.active_sessions,
    totalRevenueToday: raw.total_revenue_today,
    totalRevenueMonth: raw.total_revenue_month,
    availableAccounts: raw.available_accounts,
    totalAccounts: raw.total_accounts,
    pendingTopups: raw.pending_topups,
    currency: raw.currency,
  }
}

export async function getDashboard(): Promise<AdminDashboard> {
  const { data } = await api.get('/admin/dashboard')
  return mapDashboard(data)
}

export async function getClients(): Promise<AdminClient[]> {
  const { data } = await api.get('/admin/clients')
  return Array.isArray(data) ? data.map(mapClient) : []
}

export async function getClient(id: string): Promise<AdminClient> {
  const { data } = await api.get(`/admin/clients/${id}`)
  return mapClient(data)
}

export async function adjustBalance(id: string, delta: number, reason?: string): Promise<void> {
  await api.patch(`/admin/clients/${id}/balance`, { delta, reason })
}

export async function getFinance(period = '7d') {
  const { data } = await api.get(`/admin/finance?period=${period}`)
  return data
}

export async function getStats() {
  const { data } = await api.get('/admin/stats')
  return data
}

export async function kickSession(sessionId: string): Promise<void> {
  await api.post(`/admin/sessions/${sessionId}/kick`, {})
}

export async function notifyClient(clientId: string, message: string): Promise<void> {
  await api.post(`/admin/notify/${clientId}`, { message })
}

function mapTopup(raw: any): AdminTopup {
  return {
    topupId: raw.topup_id,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    amount: raw.amount,
    cardLast4: raw.card_last4 ?? undefined,
    cardBank: raw.card_bank ?? undefined,
    cardLabel: raw.card_label ?? undefined,
    payTo: raw.pay_to ?? undefined,
    status: raw.status,
    createdAt: raw.created_at,
    confirmedAt: raw.confirmed_at ?? undefined,
  }
}

function mapActiveSession(raw: any): AdminActiveSession {
  return {
    sessionId: raw.session_id,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    balance: raw.balance,
    accountId: raw.account_id,
    accountLogin: raw.account_login,
    hoursTotal: raw.hours_total,
    startedAt: raw.started_at,
    endsAt: raw.ends_at,
    minutesLeft: raw.minutes_left,
  }
}

export async function getPendingTopups(): Promise<AdminTopup[]> {
  const { data } = await api.get('/admin/topups/pending')
  return Array.isArray(data) ? data.map(mapTopup) : []
}

export async function confirmTopup(topupId: string): Promise<void> {
  await api.post(`/admin/topups/${topupId}/confirm`, {})
}

export async function getActiveSessions(): Promise<AdminActiveSession[]> {
  const { data } = await api.get('/admin/sessions/active')
  return Array.isArray(data) ? data.map(mapActiveSession) : []
}
