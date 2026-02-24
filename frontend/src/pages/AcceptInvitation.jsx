import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { authClient, useSession } from '../lib/auth-client'

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading') // loading | success | error | needsLogin
  const [message, setMessage] = useState('')
  const [orgSlug, setOrgSlug] = useState(null)

  const invitationId = searchParams.get('id')

  useEffect(() => {
    if (isPending) return
    if (!invitationId) {
      setStatus('error')
      setMessage('No invitation ID found in the link.')
      return
    }

    if (!session?.user) {
      setStatus('needsLogin')
      return
    }

    authClient.organization.acceptInvitation({ invitationId })
      .then((result) => {
        if (result.error) {
          setStatus('error')
          setMessage(result.error.message || 'Failed to accept invitation')
          return
        }
        const slug = result.data?.organization?.slug
        setOrgSlug(slug)
        setStatus('success')
        if (slug) {
          setTimeout(() => navigate(`/orgs/${slug}`), 2000)
        }
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.message || 'Failed to accept invitation')
      })
  }, [session, isPending, invitationId, navigate])

  const content = (() => {
    switch (status) {
      case 'loading':
        return (
          <>
            <Loader2 className="w-12 h-12 text-sc-accent animate-spin" />
            <p className="text-gray-300">Accepting invitation...</p>
          </>
        )
      case 'success':
        return (
          <>
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-white font-display tracking-wide">Invitation accepted!</p>
            {orgSlug && (
              <p className="text-gray-400 text-sm">Redirecting to organisation page...</p>
            )}
            {orgSlug && (
              <a href={`/orgs/${orgSlug}`} className="btn-primary text-xs">
                Go to Organisation
              </a>
            )}
          </>
        )
      case 'error':
        return (
          <>
            <XCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-400 font-display tracking-wide">Could not accept invitation</p>
            <p className="text-gray-500 text-sm">{message}</p>
            <a href="/" className="btn-secondary text-xs">Go to Dashboard</a>
          </>
        )
      case 'needsLogin':
        return (
          <>
            <p className="text-white font-display tracking-wide">Sign in to accept this invitation</p>
            <a
              href={`/login?next=/accept-invitation?id=${encodeURIComponent(invitationId)}`}
              className="btn-primary text-xs"
            >
              Sign In
            </a>
          </>
        )
      default:
        return null
    }
  })()

  return (
    <div className="min-h-screen flex items-center justify-center bg-sc-dark">
      <div className="panel p-10 flex flex-col items-center gap-5 text-center max-w-sm w-full">
        <h1 className="font-display text-lg tracking-wider text-sc-accent">SC BRIDGE</h1>
        {content}
      </div>
    </div>
  )
}
