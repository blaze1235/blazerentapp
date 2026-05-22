export interface User {
  id: string
  name: string
  phone: string
  balance: number
  tier: 'bronze' | 'silver' | 'gold'
  tgChatId?: string
  language: 'en' | 'uz' | 'ru'
  isAdmin: boolean
  createdAt?: string
}

export interface RentalSession {
  id: string
  accountLogin: string
  accountPassword: string
  startedAt: string
  endsAt: string
  hoursTotal: number
  cost: number
  status: 'active' | 'completed' | 'expired'
}

export interface Transaction {
  id: string
  type: 'topup' | 'rental' | 'refund' | 'adjustment'
  amount: number
  card?: string
  sessionId?: string
  ts: string
  status: 'pending' | 'done' | 'failed'
  note?: string
}

export interface SteamAccount {
  id: string
  login: string
  status: 'free' | 'in_use' | 'cooldown' | 'blocked' | 'available' | 'reserved'
  health: number
  totalUses: number
  avgHours: number
}

export interface AdminClient {
  id: string
  name: string
  phone: string
  balance: number
  sessions: number
  totalSpent: number
  lastActive: string
  tgChatId?: string
  tier: string
  language: string
}

export interface RentQuote {
  hours: number
  pricePerHour: number
  originalCost: number
  discount: number
  finalCost: number
  currency: string
  promoApplied: boolean
  promoDiscountStr: string
  balanceAfter: number
  canAfford: boolean
}

export interface TopupInit {
  topupId: string
  amount: number
  payTo?: string
  cardLast4?: string
  cardBank?: string
  cardLabel?: string
  cardInfo?: string
  expiresInMinutes: number
}

export interface TopupStatus {
  topupId: string
  status: 'pending' | 'confirmed' | 'expired' | 'failed'
  amount: number
  payTo?: string
  cardLast4?: string
  cardBank?: string
  cardLabel?: string
  confirmedAt?: string
}

export interface AdminTopup {
  topupId: string
  customerId: string
  customerName: string
  amount: number
  cardLast4?: string
  cardBank?: string
  cardLabel?: string
  payTo?: string
  status: 'pending' | 'confirmed' | 'expired' | 'failed'
  createdAt: string
  confirmedAt?: string
}

export interface AdminActiveSession {
  sessionId: string
  customerId: string
  customerName: string
  customerPhone: string
  balance: number
  accountId: string
  accountLogin: string
  hoursTotal: number
  startedAt: string
  endsAt: string
  minutesLeft: number
}

export interface AdminDashboard {
  totalClients: number
  activeSessions: number
  totalRevenueToday: number
  totalRevenueMonth: number
  availableAccounts: number
  totalAccounts: number
  pendingTopups: number
  currency: string
}
