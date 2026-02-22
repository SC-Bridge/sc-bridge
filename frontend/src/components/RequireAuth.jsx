import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../lib/auth-client'
import LoadingState from './LoadingState'

export default function RequireAuth({ children }) {
  const { data: session, isPending } = useSession()
  const location = useLocation()

  if (isPending) {
    return <LoadingState fullScreen />
  }

  if (!session?.user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
