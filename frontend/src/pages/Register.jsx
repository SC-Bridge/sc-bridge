import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUp } from '../lib/auth-client'
import { Rocket, Mail, Lock, User, AlertCircle } from 'lucide-react'
import SocialLoginButtons from '../components/SocialLoginButtons'

export default function Register() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const result = await signUp.email({
        name,
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message || 'Registration failed')
      } else {
        navigate('/', { replace: true })
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
              SC BRIDGE
            </h1>
          </div>
          <p className="text-sm font-mono text-gray-500 tracking-widest">STAR CITIZEN COMPANION</p>
        </div>

        <div className="panel p-8">
          <h2 className="font-display font-bold text-lg text-white mb-6 text-center">Create Account</h2>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full pl-10 pr-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="Commander Name"
                />
              </div>
            </div>

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
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="Min 8 characters"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 rounded border-sc-border bg-sc-darker text-sc-accent focus:ring-sc-accent/50"
              />
              <span className="text-xs text-gray-400">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                  Privacy Policy
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="btn-primary w-full py-2.5 font-display tracking-wider uppercase text-sm disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sc-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-sc-panel text-gray-500 uppercase tracking-wider">or sign up with</span>
            </div>
          </div>

          <SocialLoginButtons callbackURL="/" loading={loading} setLoading={setLoading} setError={setError} />

          <p className="text-[11px] text-gray-500 text-center mt-3">
            By signing up with a social provider, you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
              Privacy Policy
            </a>
          </p>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-sc-accent hover:text-sc-accent/80 transition-colors">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
