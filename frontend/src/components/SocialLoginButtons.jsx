import React from 'react'
import { signIn } from '../lib/auth-client'
import { ssoProviders } from '../lib/providers'

export default function SocialLoginButtons({ callbackURL = '/', loading, setLoading, setError }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ssoProviders.map(({ id, label, path }) => (
        <button
          key={id}
          type="button"
          disabled={loading}
          onClick={async () => {
            setError('')
            setLoading(true)
            try {
              await signIn.social({ provider: id, callbackURL })
            } catch (err) {
              setError(err.message || `${label} sign-in failed`)
              setLoading(false)
            }
          }}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-all disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
            <path d={path} />
          </svg>
          <span className="font-display tracking-wide text-xs uppercase">{label}</span>
        </button>
      ))}
    </div>
  )
}
