import React, { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, Copy, Check, Loader2, XCircle, Clock, Wifi } from 'lucide-react'
import type { TopupInit, TopupStatus } from '../types'
import { checkTopup } from '../api/wallet'

interface PaymentModalProps {
  init: TopupInit
  onConfirmed: (amount: number) => void
  onCancel: () => void
}

function BankCard({ bank, label, last4, payTo }: { bank?: string; label?: string; last4?: string; payTo?: string }) {
  const [copied, setCopied] = useState<'number' | 'amount' | null>(null)

  const copy = (text: string, type: 'number' | 'amount') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const bankColors: Record<string, string> = {
    kapitalbank: 'from-[#0a2463] to-[#1e3a8a]',
    kapital: 'from-[#0a2463] to-[#1e3a8a]',
    uzcard: 'from-[#1a1a2e] to-[#16213e]',
    humo: 'from-[#134e4a] to-[#0f766e]',
    ipotekabank: 'from-[#431407] to-[#7c2d12]',
    default: 'from-[#1e1b4b] to-[#312e81]',
  }
  const bankKey = (bank || '').toLowerCase().replace(/\s/g, '')
  const gradient = bankColors[bankKey] || bankColors.default

  return (
    <div className={`relative rounded-2xl bg-gradient-to-br ${gradient} p-5 overflow-hidden shadow-2xl`}>
      {/* Shine overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />

      <div className="relative">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[3px] text-white/50 mb-0.5">Bank</p>
            <p className="text-sm font-bold text-white">{bank || 'Transfer'}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Wifi size={14} className="text-white/70" />
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[3px] text-white/50 mb-1">Card number</p>
            <p className="text-lg font-mono font-bold text-white tracking-widest">
              •••• •••• •••• {last4 || '????'}
            </p>
          </div>
          <button
            onClick={() => copy(payTo || last4 || '', 'number')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-semibold transition-colors"
          >
            {copied === 'number' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied === 'number' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {label && (
          <p className="text-[10px] text-white/40 mt-2 font-medium">{label}</p>
        )}
      </div>
    </div>
  )
}

function CountdownTimer({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()))

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(r => Math.max(0, r - 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const urgent = remaining < 120000

  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${urgent ? 'text-red-400' : 'text-slate-400'}`}>
      <Clock size={13} className={urgent ? 'text-red-400' : 'text-slate-500'} />
      Expires in {mins}:{String(secs).padStart(2, '0')}
    </div>
  )
}

export default function PaymentModal({ init, onConfirmed, onCancel }: PaymentModalProps) {
  const [status, setStatus] = useState<TopupStatus | null>(null)
  const [amountCopied, setAmountCopied] = useState(false)
  const expiresAt = Date.now() + init.expiresInMinutes * 60 * 1000

  const copyAmount = () => {
    navigator.clipboard.writeText(String(init.amount)).then(() => {
      setAmountCopied(true)
      setTimeout(() => setAmountCopied(false), 2000)
    })
  }

  // Poll for payment status every 3 seconds
  const poll = useCallback(async () => {
    try {
      const s = await checkTopup(init.topupId)
      setStatus(s)
      if (s.status === 'confirmed') {
        setTimeout(() => onConfirmed(s.amount), 1800)
      }
    } catch (_) {}
  }, [init.topupId, onConfirmed])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [poll])

  const confirmed = status?.status === 'confirmed'
  const expired = status?.status === 'expired'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-[#0d1220] border border-white/8 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        {confirmed ? (
          /* ── SUCCESS STATE ── */
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-400" />
              </div>
              <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/10" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Payment Confirmed!</h3>
            <p className="text-slate-400 text-sm mb-4">
              <span className="text-emerald-400 font-bold">+{init.amount.toLocaleString()} UZS</span> added to your balance
            </p>
            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-3">
              <p className="text-xs text-slate-400">Redirecting you now…</p>
            </div>
          </div>
        ) : expired ? (
          /* ── EXPIRED STATE ── */
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <XCircle size={32} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Payment Expired</h3>
            <p className="text-slate-400 text-sm mb-6">The time window has passed. Start a new payment.</p>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-surface border border-white/10 rounded-2xl text-slate-300 font-semibold text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          /* ── PENDING STATE ── */
          <div className="px-5 pb-6 pt-4 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white">Send Payment</h3>
              <CountdownTimer expiresAt={expiresAt} />
            </div>

            {/* Card visual */}
            <BankCard
              bank={init.cardBank}
              label={init.cardLabel}
              last4={init.cardLast4}
              payTo={init.payTo}
            />

            {/* Amount box */}
            <div className="bg-surface border border-white/8 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Send exactly this amount
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-3xl font-black text-white">
                    {init.amount.toLocaleString()}
                  </span>
                  <span className="text-slate-400 text-sm ml-2 font-medium">UZS</span>
                </div>
                <button
                  onClick={copyAmount}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-brand/20 hover:bg-blue-brand/30 border border-blue-brand/30 rounded-xl text-blue-xl text-xs font-bold transition-colors"
                >
                  {amountCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {amountCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Transfer destination */}
            {init.payTo && (
              <div className="bg-surface border border-white/8 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                  Transfer to
                </p>
                <p className="text-sm text-white font-medium break-all">{init.payTo}</p>
              </div>
            )}

            {/* Waiting indicator */}
            <div className="flex items-center gap-3 bg-blue-brand/5 border border-blue-brand/15 rounded-2xl px-4 py-3">
              <div className="relative shrink-0">
                <Loader2 size={16} className="animate-spin text-blue-xl" />
                <div className="absolute inset-0 animate-ping rounded-full bg-blue-brand/20" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-xl">Listening for payment…</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Detected automatically within seconds
                </p>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
            >
              Cancel payment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
