import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePreferences, setPreferences } from './useAPI'
import { useSession } from '../lib/auth-client'

const TimezoneContext = createContext({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  setTimezone: () => {},
  loading: false,
})

export function TimezoneProvider({ children }) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const { data: prefs, loading: prefsLoading } = usePreferences({ skip: !isLoggedIn })
  const [timezone, setTimezoneState] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (prefs?.timezone) {
      setTimezoneState(prefs.timezone)
    }
  }, [prefs])

  const setTimezone = useCallback(async (tz) => {
    setTimezoneState(tz)
    if (isLoggedIn) {
      setLoading(true)
      try {
        await setPreferences({ timezone: tz })
      } finally {
        setLoading(false)
      }
    }
  }, [isLoggedIn])

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone, loading: prefsLoading || loading }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export default function useTimezone() {
  return useContext(TimezoneContext)
}
