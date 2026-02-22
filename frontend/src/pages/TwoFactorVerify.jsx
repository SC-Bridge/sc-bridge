import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '../lib/auth-client'
import { Rocket, Shield, AlertCircle } from 'lucide-react'

export default function TwoFactorVerify() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useBackup, setUseBackup] = useState(false)

  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (useBackup) {
        const result = await authClient.twoFactor.verifyBackupCode({ code })
        if (result.error) {
          setError(result.error.message || 'Invalid backup code')
        } else {
          navigate('/', { replace: true })
        }
      } else {
        const result = await authClient.twoFactor.verifyTotp({ code })
        if (result.error) {
          setError(result.error.message || 'Invalid code')
        } else {
          navigate('/', { replace: true })
        }
      }
    } catch (err) {
      setError(err.message || 'Verification failed')
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
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-sc-accent" />
            <h2 className="font-display font-bold text-lg text-white">
              {useBackup ? 'Backup Code' : 'Two-Factor Authentication'}
            </h2>
          </div>

          <p className="text-sm text-gray-400 text-center mb-6">
            {useBackup
              ? 'Enter one of your backup codes to sign in.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="totp-code" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                {useBackup ? 'Backup Code' : 'Verification Code'}
              </label>
              <input
                id="totp-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode={useBackup ? 'text' : 'numeric'}
                pattern={useBackup ? undefined : '[0-9]{6}'}
                maxLength={useBackup ? 10 : 6}
                className="w-full px-4 py-3 bg-sc-darker border border-sc-border rounded text-center text-lg font-mono text-white tracking-[0.5em] placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                placeholder={useBackup ? 'XXXXXXXXXX' : '000000'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 font-display tracking-wider uppercase text-sm disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setUseBackup(!useBackup); setCode(''); setError('') }}
              className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors"
            >
              {useBackup ? 'Use authenticator app instead' : 'Use a backup code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
