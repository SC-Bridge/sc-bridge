import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Rocket, Mail, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { authClient } from '../lib/auth-client'

export default function VerifyEmail() {
  const location = useLocation()
  const email = location.state?.email || ''

  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState(null)
  const [resendError, setResendError] = useState(null)

  const handleResend = async () => {
    if (!email) return
    setResending(true)
    setResendError(null)
    setResendMsg(null)
    try {
      await authClient.sendVerificationEmail({ email })
      setResendMsg('Verification email sent')
      setTimeout(() => setResendMsg(null), 5000)
    } catch (err) {
      setResendError(err.message || 'Failed to resend verification email')
    } finally {
      setResending(false)
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

        <div className="panel p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-sc-accent/10 border border-sc-accent/30 flex items-center justify-center">
              <Mail className="w-8 h-8 text-sc-accent" />
            </div>
          </div>

          <h2 className="font-display font-bold text-lg text-white mb-3">Check Your Email</h2>

          <p className="text-sm text-gray-400 mb-6">
            We've sent a verification link to{' '}
            {email ? (
              <strong className="text-white">{email}</strong>
            ) : (
              'your email address'
            )}
            . Click the link to activate your account.
          </p>

          {resendError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{resendError}</span>
            </div>
          )}
          {resendMsg && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{resendMsg}</span>
            </div>
          )}

          {email && (
            <button
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-2 text-sm text-sc-accent hover:text-sc-accent/80 transition-colors disabled:opacity-50 mb-6"
            >
              <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
              {resending ? 'Sending...' : "Didn't get the email? Resend"}
            </button>
          )}

          <div className="mt-4">
            <Link
              to="/login"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
