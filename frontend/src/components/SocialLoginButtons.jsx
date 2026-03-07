import React from 'react'
import { signIn } from '../lib/auth-client'
import { ssoProviders } from '../lib/providers'

const BRAND_STYLES = {
  google:  'border-gray-600 hover:bg-white/10 hover:border-gray-400',
  github:  'border-gray-600 hover:bg-[#333]/40 hover:border-gray-400',
  discord: 'border-[#5865F2]/40 text-[#5865F2] hover:bg-[#5865F2]/10 hover:border-[#5865F2]/70',
  twitch:  'border-[#9146FF]/40 text-[#9146FF] hover:bg-[#9146FF]/10 hover:border-[#9146FF]/70',
}

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
          className={`flex items-center justify-center gap-2 px-3 py-2.5 bg-sc-darker border rounded text-sm hover:text-white transition-all disabled:opacity-50 ${BRAND_STYLES[id] || 'border-sc-border text-gray-300 hover:border-gray-500'}`}
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
