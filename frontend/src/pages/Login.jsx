import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authClient, signIn } from '../lib/auth-client'
import { Rocket, Mail, Lock, AlertCircle, Fingerprint } from 'lucide-react'
import SocialLoginButtons from '../components/SocialLoginButtons'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message || 'Login failed')
      } else {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sc-darker">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Rocket className="w-8 h-8 text-sc-accent" />
            <h1 className="font-display font-bold text-2xl tracking-wider text-sc-accent">
              FLEET MGR
            </h1>
          </div>
          <p className="text-sm font-mono text-gray-500 tracking-widest">STAR CITIZEN</p>
        </div>

        <div className="panel p-8">
          <h2 className="font-display font-bold text-lg text-white mb-6 text-center">Sign In</h2>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="commander@rsi.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="Password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 font-display tracking-wider uppercase text-sm disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sc-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-sc-panel text-gray-500 uppercase tracking-wider">or continue with</span>
            </div>
          </div>

          <SocialLoginButtons callbackURL={from} loading={loading} setLoading={setLoading} setError={setError} />

          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setError('')
              setLoading(true)
              try {
                const result = await authClient.signIn.passkey()
                if (result?.error) {
                  setError(result.error.message || 'Passkey sign-in failed')
                } else {
                  navigate(from, { replace: true })
                }
              } catch (err) {
                setError(err.message || 'Passkey sign-in failed')
              } finally {
                setLoading(false)
              }
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-all disabled:opacity-50"
          >
            <Fingerprint className="w-4 h-4" />
            <span className="font-display tracking-wide text-xs uppercase">Sign in with Passkey</span>
          </button>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
