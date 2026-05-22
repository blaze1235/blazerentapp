import api from './client'
import type { Transaction, TopupStatus, TopupInit } from '../types'

function mapTransaction(raw: any): Transaction {
  return {
    id: raw.id,
    type: raw.type,
    amount: raw.amount,
    card: raw.card ?? undefined,
    sessionId: raw.session_id ?? undefined,
    ts: raw.ts,
    status: raw.status,
    note: raw.note ?? undefined,
  }
}

export async function getBalance(): Promise<{ balance: number; currency: string }> {
  const { data } = await api.get('/wallet/balance')
  return data
}

export async function getTransactions(limit = 50): Promise<Transaction[]> {
  const { data } = await api.get(`/wallet/transactions?limit=${limit}`)
  return Array.isArray(data) ? data.map(mapTransaction) : []
}

export async function initiateTopup(amount: number, cardLast4?: string): Promise<TopupInit> {
  const { data } = await api.post('/wallet/topup/initiate', {
    amount,
    card_last4: cardLast4 || null,
  })
  return {
    topupId: data.topup_id,
    amount: data.amount,
    payTo: data.pay_to,
    cardLast4: data.card_last4,
    cardBank: data.card_bank,
    cardLabel: data.card_label,
    cardInfo: data.card_info,
    expiresInMinutes: data.expires_in_minutes,
  }
}

export async function checkTopup(topupId: string): Promise<TopupStatus> {
  const { data } = await api.get(`/wallet/topup/${topupId}/status`)
  return {
    topupId: data.topup_id,
    status: data.status,
    amount: data.amount,
    payTo: data.pay_to,
    cardLast4: data.card_last4,
    cardBank: data.card_bank,
    cardLabel: data.card_label,
    confirmedAt: data.confirmed_at,
  }
}
