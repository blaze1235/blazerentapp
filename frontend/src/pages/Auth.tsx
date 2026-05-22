import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Eye, EyeOff, Loader2 } from 'lucide-react'
import { login, register } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Auth() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let result
      if (mode === 'login') {
        result = await login(phone, password)
      } else {
        result = await register(name, phone, password)
      }
      storeLogin(result.access_token, result.user)
      navigate('/app/home', { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Something went wrong. Try again.'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-brand to-blue-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-brand/30">
            <Flame size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">BlazeRent</h1>
          <p className="text-slate-400 text-sm mt-1">Steam Account Rental</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-white/5 rounded-2xl p-6 shadow-xl">
          {/* Mode toggle */}
          <div className="flex bg-surface rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-blue-brand text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-brand/60 focus:ring-1 focus:ring-blue-brand/30 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998901234567"
                required
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-brand/60 focus:ring-1 focus:ring-blue-brand/30 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-brand/60 focus:ring-1 focus:ring-blue-brand/30 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-blue-brand to-blue-l hover:from-blue-l hover:to-blue-xl rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-brand/20"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-5">
          By continuing you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
