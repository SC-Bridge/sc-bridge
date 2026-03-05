import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { usePreferences, setPreferences } from './useAPI'
import { useSession } from '../lib/auth-client'

const GameVersionContext = createContext({
  versions: [],
  defaultVersion: null,
  activeCode: null,
  isPreview: false,
  setPreviewPatch: () => {},
  loading: false,
})

export function GameVersionProvider({ children }) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const userRole = session?.user?.role || 'user'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  const { data: prefs } = usePreferences({ skip: !isLoggedIn })

  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/patches')
      .then(r => r.json())
      .then(data => {
        setVersions(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const defaultVersion = useMemo(
    () => versions.find(v => v.is_default) || versions[0] || null,
    [versions]
  )

  const adminPreviewPatch = isAdmin ? (prefs?.adminPreviewPatch || null) : null
  const activeCode = adminPreviewPatch || defaultVersion?.code || null
  const isPreview = !!adminPreviewPatch

  const setPreviewPatch = useCallback(async (code) => {
    await setPreferences({ adminPreviewPatch: code })
    // Force a page reload to clear all cached SWR data with old version
    window.location.reload()
  }, [])

  const value = useMemo(() => ({
    versions,
    defaultVersion,
    activeCode,
    isPreview,
    setPreviewPatch,
    loading,
  }), [versions, defaultVersion, activeCode, isPreview, setPreviewPatch, loading])

  return (
    <GameVersionContext.Provider value={value}>
      {children}
    </GameVersionContext.Provider>
  )
}

export default function useGameVersion() {
  return useContext(GameVersionContext)
}
