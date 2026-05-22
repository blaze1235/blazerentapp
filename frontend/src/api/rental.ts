import api from './client'
import type { RentalSession, RentQuote } from '../types'

function mapSession(raw: any): RentalSession {
  return {
    id: raw.id,
    accountLogin: raw.account_login,
    accountPassword: raw.account_password,
    startedAt: raw.started_at,
    endsAt: raw.ends_at,
    hoursTotal: raw.hours_total,
    cost: raw.cost,
    status: raw.status,
  }
}

function mapQuote(raw: any): RentQuote {
  return {
    hours: raw.hours,
    pricePerHour: raw.price_per_hour,
    originalCost: raw.original_cost,
    discount: raw.discount,
    finalCost: raw.final_cost,
    currency: raw.currency,
    promoApplied: raw.promo_applied,
    promoDiscountStr: raw.promo_discount_str,
    balanceAfter: raw.balance_after,
    canAfford: raw.can_afford,
  }
}

export async function getActiveSession(): Promise<RentalSession | null> {
  const { data } = await api.get('/sessions/active')
  return data ? mapSession(data) : null
}

export async function getRentQuote(hours: number, promoCode?: string): Promise<RentQuote> {
  const { data } = await api.post('/sessions/quote', { hours, promo_code: promoCode || null })
  return mapQuote(data)
}

export async function confirmRent(hours: number, promoCode?: string): Promise<RentalSession> {
  const { data } = await api.post('/sessions/rent', { hours, promo_code: promoCode || null })
  return mapSession(data)
}

export async function extendSession(sessionId: string, hours: number, promoCode?: string): Promise<RentalSession> {
  const { data } = await api.post(`/sessions/${sessionId}/extend`, {
    hours,
    promo_code: promoCode || null,
  })
  return mapSession(data)
}

export async function endSession(sessionId: string): Promise<void> {
  await api.post(`/sessions/${sessionId}/end`)
}

export async function getSessionHistory(limit = 20): Promise<RentalSession[]> {
  const { data } = await api.get(`/sessions/history?limit=${limit}`)
  return Array.isArray(data) ? data.map(mapSession) : []
}
