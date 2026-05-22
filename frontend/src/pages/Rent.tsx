import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Tag, ArrowRight, Loader2, AlertCircle, Wallet } from 'lucide-react'
import { getRentQuote, confirmRent } from '../api/rental'
import { initiateTopup } from '../api/wallet'
import { useAuthStore } from '../store/auth'
import { useSessionStore } from '../store/session'
import { useActiveSession } from '../hooks/useActiveSession'
import PaymentModal from '../components/PaymentModal'
import type { TopupInit } from '../types'

const QUICK_HOURS = [1, 2, 3, 5, 6, 12, 24]

export default function Rent() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, setBalance } = useAuthStore()
  const { setSession } = useSessionStore()
  const { activeSession } = useActiveSession()

  const [hours, setHours] = useState(3)
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState('')
  const [promoError, setPromoError] = useState('')
  const [error, setError] = useState('')
  const [pendingPayment, setPendingPayment] = useState<TopupInit | null>(null)

  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ['rentQuote', hours, appliedPromo],
    queryFn: () => getRentQuote(hours, appliedPromo || undefined),
    enabled: !!user && !activeSession,
    placeholderData: (prev: any) => prev,
  })

  const rentMutation = useMutation({
    mutationFn: () => confirmRent(hours, appliedPromo || undefined),
    onSuccess: (session) => {
      setSession(session)
      qc.invalidateQueries({ queryKey: ['activeSession'] })
      navigate('/app/sessions')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Failed to start rental'
      setError(typeof msg === 'string' ? msg : 'Failed to start rental')
    },
  })

  const shortfall = quote ? Math.max(0, quote.finalCost - (user?.balance ?? 0)) : 0

  const topupMutation = useMutation({
    mutationFn: () => initiateTopup(shortfall),
    onSuccess: (data) => setPendingPayment(data),
  })

  const handlePaymentConfirmed = (amount: number) => {
    setBalance((user?.balance ?? 0) + amount)
    setPendingPayment(null)
    setTimeout(() => rentMutation.mutate(), 300)
  }

  const sliderPct = ((hours - 1) / 23) * 100

  if (activeSession) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 40px' }}>
        <div style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', borderRadius:16, padding:'16px 20px', marginBottom:24, display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:34, height:34, background:'rgba(239,68,68,.1)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <AlertCircle size={16} color="#f87171" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#f87171', marginBottom:2 }}>Session already active</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>You already have an active rental. Finish it before starting a new one.</div>
          </div>
          <button className="btn btn-red btn-sm" onClick={() => navigate('/app/sessions')}>View session</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 40px' }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-.5px', marginBottom:4 }}>Rent an account</div>
      <div style={{ fontSize:13, color:'#94a3b8', marginBottom:28 }}>CS2 Prime — choose how long you want to play</div>

      {/* Account preview card */}
      <div style={{ background:'#111827', border:'1px solid rgba(37,99,235,.2)', borderRadius:24, padding:24, marginBottom:24, display:'flex', alignItems:'center', gap:18 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:'linear-gradient(135deg,#1a2f6e,#0d1b40)', border:'1px solid rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>🎮</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:900, marginBottom:4 }}>CS2 Prime Account</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span className="tag tag-green">Prime status</span>
            <span className="tag tag-live">Available now</span>
            <span className="tag tag-purple">Auto Steam Guard</span>
          </div>
        </div>
        {quote && (
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:3 }}>From</div>
            <div style={{ fontSize:20, fontWeight:900, color:'#60a5fa' }}>
              {quote.pricePerHour.toLocaleString()} <span style={{ fontSize:12, color:'#94a3b8', fontWeight:500 }}>UZS/hr</span>
            </div>
          </div>
        )}
      </div>

      {/* Duration picker */}
      <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,.06)', borderRadius:24, padding:24, marginBottom:16 }}>
        {/* Hero number */}
        <div style={{ textAlign:'center', padding:'28px 0 20px' }}>
          <div style={{ fontSize:80, fontWeight:900, letterSpacing:-5, lineHeight:1, background:'linear-gradient(135deg,#fff,#60a5fa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            {hours}
          </div>
          <div style={{ fontSize:13, color:'#94a3b8', marginTop:4 }}>hours</div>
        </div>

        {/* Slider */}
        <input
          type="range" min={1} max={24} value={hours}
          onChange={e => setHours(Number(e.target.value))}
          className="hslider"
          style={{
            background: `linear-gradient(90deg,#2563eb ${sliderPct}%,rgba(255,255,255,.08) ${sliderPct}%)`,
            marginBottom:8,
          }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#64748b', marginBottom:20 }}>
          <span>1h</span><span>6h</span><span>12h</span><span>24h</span>
        </div>

        {/* Quick hour buttons */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center', marginBottom:24 }}>
          {QUICK_HOURS.map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding:'8px 14px', borderRadius:10, cursor:'pointer', fontSize:12, fontWeight:700, transition:'.18s',
                border: `1px solid ${hours === h ? '#3b82f6' : 'rgba(255,255,255,.06)'}`,
                color: hours === h ? '#60a5fa' : '#94a3b8',
                background: hours === h ? 'rgba(59,130,246,.08)' : 'none',
              }}
            >
              {h}h
            </button>
          ))}
        </div>

        {/* Promo */}
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          <input
            value={promoInput}
            onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError('') }}
            placeholder="Promo code (optional)"
            style={{ flex:1, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'12px 16px', color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none', textTransform:'uppercase' }}
          />
          <button
            className="btn btn-ghost"
            disabled={!promoInput.trim()}
            onClick={() => { setPromoError(''); if (promoInput.trim()) setAppliedPromo(promoInput.trim()) }}
          >
            Apply
          </button>
        </div>
        {promoError && <div style={{ fontSize:12, color:'#f87171', marginBottom:8 }}>{promoError}</div>}
        {quote?.promoApplied && <div style={{ fontSize:12, color:'#4ade80', marginBottom:8 }}>Promo applied! Saving {quote.promoDiscountStr} UZS</div>}

        {/* Price summary */}
        <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.04)', borderRadius:16, padding:'18px 20px', marginBottom:20 }}>
          {quoteLoading ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:13 }}>
              <Loader2 size={14} className="animate-spin" /> Calculating…
            </div>
          ) : quote ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#94a3b8', marginBottom:9 }}>
                <span>{hours}h × {quote.pricePerHour.toLocaleString()} UZS</span>
                <span style={{ color:'#fff' }}>{quote.originalCost.toLocaleString()} UZS</span>
              </div>
              {quote.discount > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:9, color:'#4ade80' }}>
                  <span>Promo discount</span>
                  <span>−{quote.discount.toLocaleString()} UZS</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid rgba(255,255,255,.05)', paddingTop:10, color:'#fff', fontWeight:800, fontSize:15 }}>
                <span>Total</span>
                <span style={{ color:'#60a5fa' }}>{quote.finalCost.toLocaleString()} UZS</span>
              </div>
              <div style={{ marginTop:8, fontSize:11, color:'#64748b' }}>
                Balance after: <span style={{ color:'#60a5fa' }}>{quote.balanceAfter.toLocaleString()} UZS</span>
              </div>
            </>
          ) : null}
        </div>

        {/* Insufficient balance warning */}
        {quote && !quote.canAfford && (
          <div style={{ background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.2)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
            <Wallet size={14} color="#fbbf24" style={{ flexShrink:0 }} />
            <span style={{ fontSize:12, color:'#fbbf24', lineHeight:1.5 }}>
              You need <b>{shortfall.toLocaleString()} UZS</b> more. Pay now and your session starts automatically.
            </span>
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#f87171', fontSize:13, borderRadius:12, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* CTA */}
        {quote?.canAfford ? (
          <button
            className="btn btn-primary btn-w btn-lg"
            onClick={() => { setError(''); rentMutation.mutate() }}
            disabled={rentMutation.isPending || quoteLoading}
          >
            {rentMutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Starting…</>
              : <><Zap size={15} /> Confirm rental — {quote?.finalCost.toLocaleString()} UZS</>
            }
          </button>
        ) : (
          <button
            onClick={() => topupMutation.mutate()}
            disabled={topupMutation.isPending || quoteLoading || !quote}
            style={{
              width:'100%', padding:'16px 28px', fontSize:13, fontWeight:800, borderRadius:14,
              background:'linear-gradient(135deg,#f59e0b,#f97316)',
              border:'none', cursor:'pointer', color:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              boxShadow:'0 4px 20px rgba(245,158,11,.3)',
              textTransform:'uppercase', letterSpacing:'1.5px',
              opacity: topupMutation.isPending || !quote ? .6 : 1,
            }}
          >
            {topupMutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Getting payment details…</>
              : <><Wallet size={15} /> Pay {shortfall.toLocaleString()} UZS &amp; Rent</>
            }
          </button>
        )}

        {quote?.canAfford && (
          <div style={{ textAlign:'center', fontSize:11, color:'#64748b', marginTop:10 }}>Deducted from your balance instantly</div>
        )}
      </div>

      {pendingPayment && (
        <PaymentModal
          init={pendingPayment}
          onConfirmed={handlePaymentConfirmed}
          onCancel={() => setPendingPayment(null)}
        />
      )}
    </div>
  )
}
