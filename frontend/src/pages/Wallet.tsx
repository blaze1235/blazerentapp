import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Loader2, PlusCircle, Zap, Clock } from 'lucide-react'
import { getTransactions, initiateTopup } from '../api/wallet'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import PaymentModal from '../components/PaymentModal'
import type { Transaction, TopupInit } from '../types'

const QUICK_AMOUNTS = [25000, 50000, 100000, 150000, 200000, 500000]

function TxIcon({ type }: { type: Transaction['type'] }) {
  if (type === 'topup' || type === 'refund' || type === 'adjustment') {
    return (
      <div style={{ width:36, height:36, borderRadius:10, background:'rgba(34,197,94,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <ArrowDownLeft size={15} color="#4ade80" />
      </div>
    )
  }
  return (
    <div style={{ width:36, height:36, borderRadius:10, background:'rgba(239,68,68,.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <ArrowUpRight size={15} color="#f87171" />
    </div>
  )
}

export default function Wallet() {
  const { user, setBalance } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [topupAmount, setTopupAmount] = useState(100000)
  const [activePayment, setActivePayment] = useState<TopupInit | null>(null)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => getTransactions(50),
    enabled: !!user,
  })

  const topupMutation = useMutation({
    mutationFn: () => initiateTopup(topupAmount),
    onSuccess: (data) => setActivePayment(data),
  })

  const handleConfirmed = (amount: number) => {
    setBalance((user?.balance ?? 0) + amount)
    setActivePayment(null)
    qc.invalidateQueries({ queryKey: ['transactions'] })
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 40px' }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-.5px', marginBottom:4 }}>Wallet</div>
      <div style={{ fontSize:13, color:'#94a3b8', marginBottom:28 }}>Your balance and top-up history</div>

      {/* Balance hero */}
      <div style={{
        background:'linear-gradient(135deg,rgba(37,99,235,.1),rgba(139,92,246,.05))',
        border:'1px solid rgba(37,99,235,.25)', borderRadius:24, padding:'32px', marginBottom:24, textAlign:'center', position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-80, right:-80, width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle,rgba(37,99,235,.08),transparent 70%)', pointerEvents:'none' }} />
        <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:8 }}>Current balance</div>
        <div style={{ fontSize:48, fontWeight:900, color:'#60a5fa', letterSpacing:-2, lineHeight:1 }}>{(user?.balance ?? 0).toLocaleString()}</div>
        <div style={{ fontSize:14, color:'#94a3b8', marginBottom:20 }}>UZS</div>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button className="btn btn-primary" onClick={() => {}}>
            <PlusCircle size={14} /> Top up
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/app/rent')}>
            <Zap size={14} /> Rent now
          </button>
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(34,197,94,.05)', border:'1px solid rgba(34,197,94,.15)', borderRadius:14, padding:'14px 18px', marginBottom:24, fontSize:12, color:'#86efac', lineHeight:1.5, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:16 }}>ℹ️</span>
        Top up once — rent anytime without re-transferring each time. Your balance never expires.
      </div>

      {/* Top up form */}
      {!activePayment && (
        <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,.06)', borderRadius:20, padding:20, marginBottom:24 }}>
          <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:16 }}>Top Up Balance</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:18 }}>
            {QUICK_AMOUNTS.map(a => (
              <button
                key={a}
                onClick={() => setTopupAmount(a)}
                style={{
                  borderRadius:12, padding:14, textAlign:'center', cursor:'pointer',
                  border: `1px solid ${topupAmount === a ? '#3b82f6' : 'rgba(255,255,255,.06)'}`,
                  background: topupAmount === a ? 'rgba(59,130,246,.08)' : 'none',
                  transition:'.18s',
                }}
              >
                <div style={{ fontSize:14, fontWeight:900, color: topupAmount === a ? '#60a5fa' : '#fff' }}>{a >= 1000 ? `${(a/1000).toFixed(0)}k` : a}</div>
                <div style={{ fontSize:10, color:'#64748b' }}>UZS</div>
              </button>
            ))}
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:10, fontWeight:900, color:'#64748b', textTransform:'uppercase', letterSpacing:2, display:'block', marginBottom:7 }}>Custom amount</label>
            <input
              type="number"
              value={topupAmount}
              onChange={e => setTopupAmount(Number(e.target.value))}
              style={{ width:'100%', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'12px 16px', color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <button
            className="btn btn-primary btn-w"
            onClick={() => topupMutation.mutate()}
            disabled={topupMutation.isPending || topupAmount <= 0}
            style={{ padding:'14px', fontSize:13, borderRadius:14 }}
          >
            {topupMutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Getting payment details…</>
              : <><PlusCircle size={15} /> Top Up {topupAmount.toLocaleString()} UZS</>
            }
          </button>
        </div>
      )}

      {/* Transactions */}
      <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:12 }}>Transactions</div>
      {isLoading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'32px 0' }}>
          <Loader2 size={20} color="#64748b" className="animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="tbl-wrap" style={{ padding:'24px', textAlign:'center', color:'#64748b', fontSize:13 }}>No transactions yet</div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Type</th><th>Amount</th><th>Reference</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <TxIcon type={tx.type} />
                      <div>
                        <div style={{ fontWeight:700, textTransform:'capitalize' }}>{tx.type}</div>
                        {tx.note && <div className="td-sub">{tx.note}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight:800, color: tx.amount > 0 ? '#4ade80' : '#f87171' }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </td>
                  <td style={{ color:'#64748b' }}>{tx.card ? `••••${tx.card}` : tx.sessionId?.slice(0,8) || '—'}</td>
                  <td style={{ color:'#94a3b8' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <Clock size={10} color="#475569" />
                      <span style={{ fontSize:11 }}>{new Date(tx.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                  </td>
                  <td>
                    {tx.status === 'done'    && <span className="tag tag-green">Done</span>}
                    {tx.status === 'pending' && <span className="tag tag-live">Pending</span>}
                    {tx.status === 'failed'  && <span className="tag tag-red">Failed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activePayment && (
        <PaymentModal
          init={activePayment}
          onConfirmed={handleConfirmed}
          onCancel={() => setActivePayment(null)}
        />
      )}
    </div>
  )
}
