import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { User, Mail, Lock, Shield, Monitor, AlertCircle, Check, Fingerprint, Key, Trash2, Download, Send, AlertTriangle, Copy, Pencil, Link2, Plus, X, Star, RefreshCw, Upload, ImageOff } from 'lucide-react'
import { useSession, authClient, signIn, signOut } from '../lib/auth-client'
import { ssoProviders, getProvider } from '../lib/providers'
import useTimezone from '../hooks/useTimezone'
import { formatDate } from '../lib/dates'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import PanelSection from '../components/PanelSection'
import RsiOrgChip from '../components/RsiOrgChip'

export default function Account() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: session, isPending } = useSession()
  const { timezone } = useTimezone()
  const user = session?.user

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [error, setError] = useState(null)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState(null)
  const [emailError, setEmailError] = useState(null)
  const [showEmailEdit, setShowEmailEdit] = useState(false)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [passwordError, setPasswordError] = useState(null)

  // Sessions
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // 2FA
  const [totpUri, setTotpUri] = useState(null)
  const [backupCodes, setBackupCodes] = useState(null)
  const [totpCode, setTotpCode] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [twoFAError, setTwoFAError] = useState(null)
  const [twoFAMsg, setTwoFAMsg] = useState(null)
  const [twoFAPassword, setTwoFAPassword] = useState('')
  const [showEnablePrompt, setShowEnablePrompt] = useState(false)
  const [showDisablePrompt, setShowDisablePrompt] = useState(false)

  // Passkeys
  const [passkeys, setPasskeys] = useState([])
  const [passkeysLoading, setPasskeysLoading] = useState(true)
  const [passkeyError, setPasskeyError] = useState(null)
  const [showPasskeyNamePrompt, setShowPasskeyNamePrompt] = useState(false)
  const [passkeyNameInput, setPasskeyNameInput] = useState('')
  const [editingPasskeyId, setEditingPasskeyId] = useState(null)
  const [editingPasskeyName, setEditingPasskeyName] = useState('')

  // Account providers (OAuth vs password)
  const [hasPassword, setHasPassword] = useState(null) // null = loading, true/false = known
  const [providers, setProviders] = useState([])
  const [availableProviders, setAvailableProviders] = useState([])
  const [unlinkConfirm, setUnlinkConfirm] = useState(null) // providerId being confirmed
  const [unlinking, setUnlinking] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [initPw, setInitPw] = useState('')
  const [initPwConfirm, setInitPwConfirm] = useState('')
  const [initPwSaving, setInitPwSaving] = useState(false)
  const [initPwMsg, setInitPwMsg] = useState(null)
  const [initPwError, setInitPwError] = useState(null)

  // RSI Profile
  const [rsiProfile, setRsiProfile] = useState(null)
  const [rsiLoading, setRsiLoading] = useState(true)
  const [rsiHandle, setRsiHandle] = useState('')
  const [rsiSyncing, setRsiSyncing] = useState(false)
  const [rsiError, setRsiError] = useState(null)
  const [rsiMsg, setRsiMsg] = useState(null)

  // Avatar
  const [avatarInfo, setAvatarInfo] = useState(null)
  const [avatarMsg, setAvatarMsg] = useState(null)
  const [avatarError, setAvatarError] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [showAvatarChoice, setShowAvatarChoice] = useState(null) // { gravatarUrl }
  const avatarFileRef = useRef(null)

  // Data & Privacy
  const [exporting, setExporting] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [dataMsg, setDataMsg] = useState(null)
  const [dataError, setDataError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user) setName(user.name || '')
  }, [user])

  useEffect(() => {
    if (searchParams.get('emailChanged') === 'true') {
      setEmailMsg('Your email address has been updated successfully')
      setSearchParams({}, { replace: true })
      setTimeout(() => setEmailMsg(null), 8000)
    }
  }, [searchParams, setSearchParams])

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const result = await authClient.listSessions()
      setSessions(result.data || [])
    } catch {
      // Sessions listing may not be available
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const fetchPasskeys = useCallback(async () => {
    setPasskeysLoading(true)
    try {
      const result = await authClient.passkey.listUserPasskeys()
      setPasskeys(result.data || [])
    } catch {
      // Passkey listing may not be available
    } finally {
      setPasskeysLoading(false)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const resp = await fetch('/api/account/providers', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setHasPassword(data.hasPassword)
        setProviders(data.providers)
        setAvailableProviders(data.availableProviders || [])
      }
    } catch {
      // Default to showing password section if check fails
      setHasPassword(true)
    }
  }, [])

  const fetchRsiProfile = useCallback(async () => {
    setRsiLoading(true)
    try {
      const resp = await fetch('/api/account/rsi-profile', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setRsiProfile(data.profile)
        if (data.profile?.handle) setRsiHandle(data.profile.handle)
      }
    } catch {
      // Non-critical
    } finally {
      setRsiLoading(false)
    }
  }, [])

  const fetchAvatarInfo = useCallback(async () => {
    try {
      const resp = await fetch('/api/account/avatar-info', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setAvatarInfo(data)
      }
    } catch {
      // Non-critical
    }
  }, [])

  const handleRsiSync = async (e) => {
    e.preventDefault()
    if (!rsiHandle.trim()) return
    setRsiSyncing(true)
    setRsiError(null)
    setRsiMsg(null)
    try {
      const resp = await fetch('/api/account/rsi-sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: rsiHandle.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setRsiError(data.error || 'Sync failed')
      } else {
        setRsiProfile(data.profile)
        setRsiMsg('RSI profile synced')
        setTimeout(() => setRsiMsg(null), 4000)
        if (data.avatarAutoSet) {
          setAvatarInfo(prev => ({ ...prev, userImage: data.avatarAutoSet, rsiAvatarUrl: data.avatarAutoSet }))
          await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
        } else if (data.gravatarUrl) {
          setShowAvatarChoice({ gravatarUrl: data.gravatarUrl })
        }
      }
    } catch (err) {
      setRsiError(err.message || 'Sync failed')
    } finally {
      setRsiSyncing(false)
    }
  }

  const handleSetAvatarSource = async (source) => {
    setAvatarError(null)
    setAvatarMsg(null)
    try {
      const resp = await fetch('/api/account/avatar', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setAvatarError(data.error || 'Failed to set avatar')
      } else {
        setAvatarInfo(prev => ({ ...prev, userImage: data.image }))
        setAvatarMsg(source === 'gravatar' ? 'Gravatar set as avatar' : 'RSI avatar applied')
        setShowAvatarChoice(null)
        setTimeout(() => setAvatarMsg(null), 4000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Failed to set avatar')
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarError(null)
    setAvatarMsg(null)
    try {
      const resp = await fetch('/api/account/avatar', { method: 'DELETE', credentials: 'include' })
      if (resp.ok) {
        setAvatarInfo(prev => ({ ...prev, userImage: null }))
        setAvatarMsg('Avatar removed')
        setTimeout(() => setAvatarMsg(null), 3000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Failed to remove avatar')
    }
  }

  const handleGravatarOptOut = async (optOut) => {
    try {
      const resp = await fetch('/api/account/gravatar-opt-out', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optOut }),
      })
      if (resp.ok) {
        setAvatarInfo(prev => ({ ...prev, gravatarOptedOut: optOut, gravatarUrl: optOut ? null : prev.gravatarUrl }))
        if (!optOut) fetchAvatarInfo()
      }
    } catch {
      // Non-critical
    }
  }

  const resizeAvatar = (file) => new Promise((resolve, reject) => {
    const MAX = 512
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Resize failed')),
        'image/webp',
        0.85,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setAvatarError(null)
    setAvatarMsg(null)
    let blob
    try {
      blob = await resizeAvatar(file)
    } catch (err) {
      setAvatarError(err.message || 'Could not process image')
      setAvatarUploading(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ''
      return
    }
    const formData = new FormData()
    formData.append('avatar', blob, 'avatar.webp')
    try {
      const resp = await fetch('/api/account/avatar/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) {
        setAvatarError(data.error || 'Upload failed')
      } else {
        setAvatarInfo(prev => ({ ...prev, userImage: data.image }))
        setAvatarMsg('Avatar uploaded')
        setTimeout(() => setAvatarMsg(null), 4000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Upload failed')
    } finally {
      setAvatarUploading(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ''
    }
  }

  useEffect(() => { fetchProviders() }, [fetchProviders])
  useEffect(() => { fetchSessions() }, [fetchSessions])
  useEffect(() => { fetchPasskeys() }, [fetchPasskeys])
  useEffect(() => { fetchRsiProfile() }, [fetchRsiProfile])
  useEffect(() => { fetchAvatarInfo() }, [fetchAvatarInfo])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    setEmailError(null)
    setEmailMsg(null)
    try {
      await authClient.updateUser({ name })

      if (showEmailEdit && newEmail && newEmail !== user.email) {
        const pendingEmail = newEmail
        const result = await authClient.changeEmail({ newEmail, callbackURL: '/account?emailChanged=true' })
        if (result.error) {
          setEmailError(result.error.message || 'Failed to change email')
        } else {
          setEmailMsg(`Verification email sent to ${pendingEmail} — click the link there to confirm the change`)
          setShowEmailEdit(false)
          setNewEmail('')
          setTimeout(() => setEmailMsg(null), 10000)
        }
      }

      setSaveMsg('Profile updated')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordMsg(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordSaving(true)
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
      })
      setPasswordMsg('Password changed')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordMsg(null), 3000)
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSetPassword = async (e) => {
    e.preventDefault()
    setInitPwError(null)
    setInitPwMsg(null)

    if (initPw !== initPwConfirm) {
      setInitPwError('Passwords do not match')
      return
    }
    if (initPw.length < 8) {
      setInitPwError('Password must be at least 8 characters')
      return
    }

    setInitPwSaving(true)
    try {
      const resp = await fetch('/api/account/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword: initPw }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setInitPwError(data.message || data.error || 'Failed to set password')
      } else {
        setInitPwMsg('Password set successfully')
        setInitPw('')
        setInitPwConfirm('')
        setHasPassword(true)
        setTimeout(() => setInitPwMsg(null), 3000)
      }
    } catch (err) {
      setInitPwError(err.message || 'Failed to set password')
    } finally {
      setInitPwSaving(false)
    }
  }

  const handleUnlinkProvider = async (providerId) => {
    setUnlinking(true)
    setLinkError(null)
    try {
      const resp = await fetch('/api/account/unlink-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setLinkError(data.error || 'Failed to unlink provider')
      } else {
        setUnlinkConfirm(null)
        await fetchProviders()
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to unlink provider')
    } finally {
      setUnlinking(false)
    }
  }

  const handleLinkProvider = async (providerId) => {
    setLinkError(null)
    try {
      await signIn.social({ provider: providerId, callbackURL: '/account' })
    } catch (err) {
      setLinkError(err.message || 'Failed to link provider')
    }
  }

  const handleEnable2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      const result = await authClient.twoFactor.enable({ password: twoFAPassword })
      if (result.data?.totpURI) {
        setTotpUri(result.data.totpURI)
        setBackupCodes(result.data.backupCodes || null)
        setShowEnablePrompt(false)
        setTwoFAPassword('')
      } else if (result.error) {
        setTwoFAError(result.error.message || 'Failed to enable 2FA')
      }
    } catch (err) {
      setTwoFAError(err.message || 'Failed to enable 2FA')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleVerify2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode })
      if (result.error) {
        setTwoFAError(result.error.message || 'Invalid code')
      } else {
        setTwoFAMsg('Two-factor authentication enabled')
        setTotpUri(null)
        setTotpCode('')
        setTimeout(() => setTwoFAMsg(null), 3000)
      }
    } catch (err) {
      setTwoFAError(err.message || 'Verification failed')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleDisable2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      await authClient.twoFactor.disable({ password: twoFAPassword })
      setTwoFAMsg('Two-factor authentication disabled')
      setShowDisablePrompt(false)
      setTwoFAPassword('')
      setTimeout(() => setTwoFAMsg(null), 3000)
    } catch (err) {
      setTwoFAError(err.message || 'Failed to disable 2FA')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleAddPasskey = async () => {
    setPasskeyError(null)
    try {
      const opts = passkeyNameInput.trim() ? { name: passkeyNameInput.trim() } : {}
      await authClient.passkey.addPasskey(opts)
      await fetchPasskeys()
      setShowPasskeyNamePrompt(false)
      setPasskeyNameInput('')
    } catch (err) {
      setPasskeyError(err.message || 'Failed to add passkey')
    }
  }

  const handleUpdatePasskey = async (id) => {
    setPasskeyError(null)
    try {
      await authClient.passkey.updatePasskey({ id, name: editingPasskeyName.trim() })
      await fetchPasskeys()
      setEditingPasskeyId(null)
      setEditingPasskeyName('')
    } catch (err) {
      setPasskeyError(err.message || 'Failed to rename passkey')
    }
  }

  const handleDeletePasskey = async (passkeyId) => {
    if (!window.confirm('Remove this passkey?')) return
    setPasskeyError(null)
    try {
      await authClient.passkey.deletePasskey({ id: passkeyId })
      await fetchPasskeys()
    } catch (err) {
      setPasskeyError(err.message || 'Failed to remove passkey')
    }
  }

  const handleRevokeSession = async (sessionToken) => {
    const isCurrent = sessionToken === session?.session?.token
    if (isCurrent && !window.confirm('This will sign you out. Continue?')) return
    try {
      await authClient.revokeSession({ token: sessionToken })
      if (isCurrent) {
        await signOut()
        navigate('/login', { replace: true })
        return
      }
      await fetchSessions()
    } catch {
      // Silently fail
    }
  }

  const handleRevokeAllSessions = async () => {
    if (!window.confirm('This will sign you out of all devices, including this one. Continue?')) return
    try {
      await authClient.revokeSessions()
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      // Silently fail
    }
  }

  const handleExportDownload = async () => {
    setExporting(true)
    setDataError(null)
    try {
      const resp = await fetch('/api/account/export', { credentials: 'include' })
      if (!resp.ok) throw new Error('Export failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'scbridge-data-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDataError(err.message || 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  const handleExportEmail = async () => {
    setEmailing(true)
    setDataError(null)
    setDataMsg(null)
    try {
      const resp = await fetch('/api/account/export-email', { method: 'POST', credentials: 'include' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to email export')
      setDataMsg(data.message)
      setTimeout(() => setDataMsg(null), 5000)
    } catch (err) {
      setDataError(err.message || 'Failed to email export')
    } finally {
      setEmailing(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    setDataError(null)
    try {
      const resp = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let message = 'Failed to delete account'
        try { message = JSON.parse(text).error || message } catch {}
        throw new Error(message)
      }
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      setDataError(err.message || 'Failed to delete account')
      setDeleting(false)
    }
  }

  if (isPending) return <LoadingState variant="skeleton" />
  if (!user) return null

  const roleBadgeColor = {
    super_admin: 'text-sc-danger bg-sc-danger/10 border-sc-danger/30',
    admin: 'text-sc-warn bg-sc-warn/10 border-sc-warn/30',
    user: 'text-gray-400 bg-white/5 border-sc-border',
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ACCOUNT"
        subtitle={user.email}
        actions={
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-mono uppercase tracking-wider ${roleBadgeColor[user.role] || roleBadgeColor.user}`}>
            <Shield className="w-3 h-3" />
            {user.role || 'user'}
          </span>
        }
      />

      {/* Profile */}
      <PanelSection title="Profile" icon={User}>
        <form onSubmit={handleUpdateProfile} className="p-5 space-y-4 max-w-md">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {saveMsg && (
            <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{saveMsg}</span>
            </div>
          )}

          {/* Avatar */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Avatar
            </label>

            {avatarError && (
              <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{avatarError}</span>
              </div>
            )}
            {avatarMsg && (
              <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
                <Check className="w-4 h-4 shrink-0" />
                <span>{avatarMsg}</span>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-sc-border overflow-hidden bg-sc-darker flex items-center justify-center shrink-0">
                {avatarInfo?.userImage ? (
                  <img
                    src={avatarInfo.userImage}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Default */}
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={!avatarInfo?.userImage}
                  className="px-2.5 py-1.5 text-xs border border-sc-border rounded text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Default
                </button>

                {/* Gravatar */}
                {avatarInfo?.gravatarUrl && !avatarInfo?.gravatarOptedOut && (
                  <button
                    type="button"
                    onClick={() => handleSetAvatarSource('gravatar')}
                    className="px-2.5 py-1.5 text-xs border border-sc-border rounded text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    Gravatar
                  </button>
                )}

                {/* RSI */}
                {avatarInfo?.rsiAvatarUrl && (
                  <button
                    type="button"
                    onClick={() => handleSetAvatarSource('rsi')}
                    className="px-2.5 py-1.5 text-xs border border-sc-border rounded text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    RSI
                  </button>
                )}

                {/* Upload */}
                <button
                  type="button"
                  onClick={() => avatarFileRef.current?.click()}
                  disabled={avatarUploading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-sc-border rounded text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3 h-3" />
                  {avatarUploading ? 'Uploading...' : 'Upload'}
                </button>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
            </div>

            {/* Gravatar opt-out toggle */}
            {avatarInfo?.gravatarUrl && (
              <button
                type="button"
                onClick={() => handleGravatarOptOut(!avatarInfo?.gravatarOptedOut)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ImageOff className="w-3 h-3" />
                {avatarInfo?.gravatarOptedOut ? 'Allow Gravatar detection' : 'Never use Gravatar'}
              </button>
            )}

            {/* Inline choice after RSI sync */}
            {showAvatarChoice && (
              <div className="p-3 bg-sc-darker border border-sc-border rounded space-y-3">
                <p className="text-sm text-gray-300">
                  RSI avatar loaded. You also have a Gravatar — which would you like to use?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetAvatarSource('rsi')}
                    className="btn-primary px-3 py-1.5 font-display tracking-wider uppercase text-xs"
                  >
                    Use RSI Avatar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAvatarSource('gravatar')}
                    className="px-3 py-1.5 text-xs border border-sc-border rounded text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    Use Gravatar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAvatarChoice(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="account-name" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Display Name
            </label>
            <input
              id="account-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            {emailError && (
              <div className="flex items-center gap-2 mb-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{emailError}</span>
              </div>
            )}
            {emailMsg && (
              <div className="flex items-center gap-2 mb-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
                <Check className="w-4 h-4 shrink-0" />
                <span>{emailMsg}</span>
              </div>
            )}
            {showEmailEdit ? (
              <div className="space-y-2">
                <input
                  id="account-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  placeholder="New email address"
                />
                <button
                  type="button"
                  onClick={() => { setShowEmailEdit(false); setNewEmail(''); setEmailError(null) }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-sc-darker/50 border border-sc-border rounded text-sm text-gray-500">
                  <Mail className="w-4 h-4" />
                  {user.email}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowEmailEdit(true); setNewEmail(user.email) }}
                  className="p-2.5 border border-sc-border rounded text-gray-400 hover:text-white hover:border-sc-accent transition-colors"
                  title="Change email"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-6 py-2 font-display tracking-wider uppercase text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </PanelSection>

      {/* RSI Citizen Profile */}
      <PanelSection title="Star Citizen Profile" icon={Star}>
        <div className="p-5 space-y-4 max-w-md">
          {rsiError && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{rsiError}</span>
            </div>
          )}
          {rsiMsg && (
            <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{rsiMsg}</span>
            </div>
          )}

          <form onSubmit={handleRsiSync} className="flex items-center gap-2">
            <div className="flex-1">
              <label htmlFor="rsi-handle" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Star Citizen Handle
              </label>
              <input
                id="rsi-handle"
                type="text"
                value={rsiHandle}
                onChange={(e) => setRsiHandle(e.target.value)}
                placeholder="e.g. NZVengeance"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
              />
            </div>
            <button
              type="submit"
              disabled={rsiSyncing || !rsiHandle.trim()}
              className="btn-primary px-4 py-2.5 font-display tracking-wider uppercase text-xs flex items-center gap-2 self-end disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rsiSyncing ? 'animate-spin' : ''}`} />
              {rsiSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </form>

          {!rsiLoading && rsiProfile && (
            <div className="space-y-4">
              {/* Avatar + basic info */}
              <div className="flex items-start gap-4">
                {rsiProfile.avatar_url && (
                  <img
                    src={rsiProfile.avatar_url}
                    alt={`${rsiProfile.handle} avatar`}
                    className="w-16 h-16 rounded border border-sc-border object-cover shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <a
                    href={`https://robertsspaceindustries.com/en/citizens/${rsiProfile.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-sc-accent hover:text-sc-accent/80 transition-colors tracking-wide text-sm font-medium"
                  >
                    {rsiProfile.handle}
                  </a>
                  {rsiProfile.citizen_record && (
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{rsiProfile.citizen_record}</p>
                  )}
                  {rsiProfile.enlisted_at && (
                    <p className="text-xs text-gray-500 mt-0.5">Enlisted: {rsiProfile.enlisted_at}</p>
                  )}
                </div>
              </div>

              {/* Org affiliations */}
              {rsiProfile.orgs && rsiProfile.orgs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Org Affiliations
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rsiProfile.orgs.map((org) => (
                      <RsiOrgChip
                        key={org.slug}
                        slug={org.slug}
                        name={org.name}
                        isMain={org.is_main}
                        scBridge={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-600 font-mono">
                Synced: {rsiProfile.fetched_at ? formatDate(rsiProfile.fetched_at, timezone) : '—'}
              </p>
            </div>
          )}

          {!rsiLoading && !rsiProfile && (
            <p className="text-sm text-gray-500">
              Enter your Star Citizen handle to sync your RSI citizen profile, including org affiliations.
            </p>
          )}
        </div>
      </PanelSection>

      {/* Linked Accounts */}
      <PanelSection title="Linked Accounts" icon={Link2}>
        <div className="p-5 space-y-4 max-w-md">
          {linkError && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{linkError}</span>
            </div>
          )}

          <p className="text-sm text-gray-400">
            Manage the sign-in methods linked to your account.
          </p>

          {/* Linked providers */}
          <div className="space-y-2">
            {providers.includes('credential') && (
              <div className="flex items-center justify-between p-3 bg-sc-darker border border-sc-border rounded">
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-sc-accent" />
                  <span className="text-sm text-white">Password</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                  Manage below
                </span>
              </div>
            )}

            {providers.filter(p => p !== 'credential').map((providerId) => {
              const provider = getProvider(providerId)
              const canUnlink = providers.length >= 2
              return (
                <div
                  key={providerId}
                  className="flex items-center justify-between p-3 bg-sc-darker border border-sc-border rounded"
                >
                  <div className="flex items-center gap-3">
                    {provider ? (
                      <svg className="w-4 h-4 text-sc-accent" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
                        <path d={provider.path} />
                      </svg>
                    ) : (
                      <Link2 className="w-4 h-4 text-sc-accent" />
                    )}
                    <span className="text-sm text-white">{provider?.label || providerId}</span>
                  </div>

                  {unlinkConfirm === providerId ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Unlink?</span>
                      <button
                        onClick={() => handleUnlinkProvider(providerId)}
                        disabled={unlinking}
                        className="px-2 py-1 text-xs text-sc-danger border border-sc-danger/30 rounded hover:bg-sc-danger/10 transition-colors disabled:opacity-50"
                      >
                        {unlinking ? 'Unlinking...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setUnlinkConfirm(null)}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setUnlinkConfirm(providerId)}
                      disabled={!canUnlink}
                      title={canUnlink ? `Unlink ${provider?.label || providerId}` : 'Cannot unlink your only authentication method'}
                      className="text-xs text-sc-danger hover:text-sc-danger/80 transition-colors font-mono uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Unlink
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Link new providers */}
          {(() => {
            const linkable = availableProviders.filter(id => !providers.includes(id))
            if (linkable.length === 0) return null
            return (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Link another account
                </p>
                <div className="flex flex-wrap gap-2">
                  {linkable.map((providerId) => {
                    const provider = getProvider(providerId)
                    if (!provider) return null
                    return (
                      <button
                        key={providerId}
                        onClick={() => handleLinkProvider(providerId)}
                        className="flex items-center gap-2 px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
                          <path d={provider.path} />
                        </svg>
                        <span className="font-display tracking-wide text-xs uppercase">{provider.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </PanelSection>

      {/* Password — Set or Change depending on account type */}
      <PanelSection title={hasPassword ? "Change Password" : "Set Password"} icon={Lock}>
        {hasPassword === false ? (
          /* OAuth-only user — no password yet */
          <form onSubmit={handleSetPassword} className="p-5 space-y-4 max-w-md">
            <p className="text-sm text-gray-400">
              You signed in with {providers.filter(p => p !== 'credential').join(', ')}. Set a password to enable two-factor authentication and password-based login.
            </p>
            {initPwError && (
              <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{initPwError}</span>
              </div>
            )}
            {initPwMsg && (
              <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
                <Check className="w-4 h-4 shrink-0" />
                <span>{initPwMsg}</span>
              </div>
            )}

            <div>
              <label htmlFor="set-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                id="set-pw"
                type="password"
                value={initPw}
                onChange={(e) => setInitPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                placeholder="Min 8 characters"
              />
            </div>

            <div>
              <label htmlFor="set-pw-confirm" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <input
                id="set-pw-confirm"
                type="password"
                value={initPwConfirm}
                onChange={(e) => setInitPwConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                placeholder="Confirm password"
              />
            </div>

            <button
              type="submit"
              disabled={initPwSaving}
              className="btn-primary px-6 py-2 font-display tracking-wider uppercase text-sm disabled:opacity-50"
            >
              {initPwSaving ? 'Setting...' : 'Set Password'}
            </button>
          </form>
        ) : (
          /* User has a password — change it */
          <form onSubmit={handleChangePassword} className="p-5 space-y-4 max-w-md">
            {passwordError && (
              <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordMsg && (
              <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
                <Check className="w-4 h-4 shrink-0" />
                <span>{passwordMsg}</span>
              </div>
            )}

            <div>
              <label htmlFor="current-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Current Password
              </label>
              <input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
              />
            </div>

            <div>
              <label htmlFor="new-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                New Password
              </label>
              <input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                placeholder="Min 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Confirm New Password
              </label>
              <input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                placeholder="Confirm new password"
              />
            </div>

            <button
              type="submit"
              disabled={passwordSaving}
              className="btn-primary px-6 py-2 font-display tracking-wider uppercase text-sm disabled:opacity-50"
            >
              {passwordSaving ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        )}
      </PanelSection>

      {/* Two-Factor Authentication */}
      <PanelSection title="Two-Factor Authentication" icon={Key}>
        <div className="p-5 max-w-md">
          {twoFAError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{twoFAError}</span>
            </div>
          )}
          {twoFAMsg && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{twoFAMsg}</span>
            </div>
          )}

          {totpUri ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Scan this QR code with your authenticator app, then enter the 6-digit code to verify.
              </p>
              <div className="flex justify-center p-4 bg-white rounded">
                <QRCodeSVG value={totpUri} size={200} />
              </div>

              {backupCodes && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Backup Codes</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(backupCodes.join('\n'))
                        setTwoFAMsg('Backup codes copied')
                        setTimeout(() => setTwoFAMsg(null), 2000)
                      }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      title="Copy backup codes"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Save these codes in a safe place. Each can be used once if you lose your authenticator.</p>
                  <div className="grid grid-cols-2 gap-1 p-3 bg-sc-darker border border-sc-border rounded font-mono text-xs text-gray-300">
                    {backupCodes.map((code, i) => (
                      <span key={i}>{code}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  className="flex-1 px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-center text-sm font-mono text-white tracking-[0.3em] placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                />
                <button
                  onClick={handleVerify2FA}
                  disabled={twoFALoading || totpCode.length !== 6}
                  className="btn-primary px-4 py-2.5 font-display tracking-wider uppercase text-xs disabled:opacity-50"
                >
                  Verify
                </button>
              </div>
              <button
                onClick={() => { setTotpUri(null); setTotpCode(''); setBackupCodes(null); setTwoFAError(null) }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : user.twoFactorEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-sc-success">
                  <Check className="w-4 h-4" /> Two-factor authentication is enabled
                </span>
              </div>
              {showDisablePrompt ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">Enter your password to disable 2FA:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={twoFAPassword}
                      onChange={(e) => setTwoFAPassword(e.target.value)}
                      placeholder="Current password"
                      autoComplete="current-password"
                      className="flex-1 px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                      onKeyDown={(e) => { if (e.key === 'Enter' && twoFAPassword) handleDisable2FA() }}
                    />
                    <button
                      onClick={handleDisable2FA}
                      disabled={twoFALoading || !twoFAPassword}
                      className="px-4 py-2.5 bg-sc-danger text-white font-display tracking-wider uppercase text-xs rounded hover:bg-sc-danger/80 transition-colors disabled:opacity-50"
                    >
                      {twoFALoading ? 'Disabling...' : 'Confirm Disable'}
                    </button>
                  </div>
                  <button
                    onClick={() => { setShowDisablePrompt(false); setTwoFAPassword(''); setTwoFAError(null) }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDisablePrompt(true)}
                  className="text-xs text-sc-danger hover:text-sc-danger/80 transition-colors font-mono uppercase tracking-wider"
                >
                  Disable 2FA
                </button>
              )}
            </div>
          ) : hasPassword === false ? (
            /* OAuth-only user without a password — can't enable 2FA yet */
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Add an extra layer of security using a TOTP authenticator app.
              </p>
              <div className="flex items-center gap-2 p-3 bg-sc-warn/10 border border-sc-warn/30 rounded text-sc-warn text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Set a password in the section above before enabling two-factor authentication.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Add an extra layer of security using a TOTP authenticator app.
              </p>
              {showEnablePrompt ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">Enter your password to continue:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={twoFAPassword}
                      onChange={(e) => setTwoFAPassword(e.target.value)}
                      placeholder="Current password"
                      autoComplete="current-password"
                      className="flex-1 px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                      onKeyDown={(e) => { if (e.key === 'Enter' && twoFAPassword) handleEnable2FA() }}
                    />
                    <button
                      onClick={handleEnable2FA}
                      disabled={twoFALoading || !twoFAPassword}
                      className="btn-primary px-4 py-2.5 font-display tracking-wider uppercase text-xs disabled:opacity-50"
                    >
                      {twoFALoading ? 'Setting up...' : 'Continue'}
                    </button>
                  </div>
                  <button
                    onClick={() => { setShowEnablePrompt(false); setTwoFAPassword(''); setTwoFAError(null) }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowEnablePrompt(true)}
                  disabled={twoFALoading}
                  className="btn-primary px-4 py-2 font-display tracking-wider uppercase text-xs disabled:opacity-50"
                >
                  Enable 2FA
                </button>
              )}
            </div>
          )}
        </div>
      </PanelSection>

      {/* Passkeys */}
      <PanelSection title="Passkeys" icon={Fingerprint}>
        <div className="p-5">
          {passkeyError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{passkeyError}</span>
            </div>
          )}

          <p className="text-sm text-gray-400 mb-4">
            Passkeys let you sign in with biometrics (fingerprint, face) or a security key.
          </p>

          {passkeysLoading ? (
            <p className="text-sm text-gray-500">Loading passkeys...</p>
          ) : (
            <>
              {passkeys.length > 0 && (
                <div className="space-y-2 mb-4">
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      className="flex items-center justify-between p-3 bg-sc-darker border border-sc-border rounded"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Fingerprint className="w-4 h-4 text-sc-accent shrink-0" />
                        {editingPasskeyId === pk.id ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="text"
                              value={editingPasskeyName}
                              onChange={(e) => setEditingPasskeyName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdatePasskey(pk.id)
                                if (e.key === 'Escape') { setEditingPasskeyId(null); setEditingPasskeyName('') }
                              }}
                              autoFocus
                              className="flex-1 min-w-0 px-3 py-1.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                              placeholder="Passkey name"
                            />
                            <button
                              onClick={() => handleUpdatePasskey(pk.id)}
                              className="btn-primary px-3 py-1.5 font-display tracking-wider uppercase text-xs"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingPasskeyId(null); setEditingPasskeyName('') }}
                              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm text-white">{pk.name || 'Passkey'}</span>
                            <p className="text-xs text-gray-500 font-mono">
                              Added: {formatDate(pk.createdAt, timezone)}
                            </p>
                          </div>
                        )}
                      </div>
                      {editingPasskeyId !== pk.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingPasskeyId(pk.id); setEditingPasskeyName(pk.name || '') }}
                            title="Rename passkey"
                            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePasskey(pk.id)}
                            title="Remove passkey"
                            className="p-1.5 rounded text-sc-danger hover:bg-sc-danger/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showPasskeyNamePrompt ? (
                <div className="space-y-3 max-w-md">
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Passkey Name (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={passkeyNameInput}
                      onChange={(e) => setPasskeyNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddPasskey()
                        if (e.key === 'Escape') { setShowPasskeyNamePrompt(false); setPasskeyNameInput('') }
                      }}
                      autoFocus
                      className="flex-1 px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                      placeholder="e.g. MacBook Pro, YubiKey"
                    />
                    <button
                      onClick={handleAddPasskey}
                      className="btn-primary px-4 py-2.5 font-display tracking-wider uppercase text-xs"
                    >
                      Continue
                    </button>
                  </div>
                  <button
                    onClick={() => { setShowPasskeyNamePrompt(false); setPasskeyNameInput('') }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPasskeyNamePrompt(true)}
                  className="btn-primary px-4 py-2 font-display tracking-wider uppercase text-xs flex items-center gap-2"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  Add Passkey
                </button>
              )}
            </>
          )}
        </div>
      </PanelSection>

      {/* Active Sessions */}
      <PanelSection title="Active Sessions" icon={Monitor}>
        <div className="p-5">
          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => {
                const isCurrent = s.token === session?.session?.token
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-sc-darker border border-sc-border rounded"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">
                          {isCurrent ? 'Current Session' : 'Session'}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono text-sc-accent bg-sc-accent/10 px-1.5 py-0.5 rounded">
                            THIS DEVICE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-1">
                        Expires: {formatDate(s.expiresAt, timezone)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(s.token)}
                      className="text-xs text-sc-danger hover:text-sc-danger/80 transition-colors font-mono uppercase tracking-wider"
                    >
                      Revoke
                    </button>
                  </div>
                )
              })}

              {sessions.length > 1 && (
                <button
                  onClick={handleRevokeAllSessions}
                  className="mt-2 px-4 py-2 bg-sc-danger/10 border border-sc-danger/30 text-sc-danger font-display tracking-wider uppercase text-xs rounded hover:bg-sc-danger/20 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Kill All Sessions
                </button>
              )}
            </div>
          )}
        </div>
      </PanelSection>

      {/* Data & Privacy */}
      <PanelSection title="Data & Privacy" icon={Download}>
        <div className="p-5 space-y-6">
          {dataError && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{dataError}</span>
            </div>
          )}
          {dataMsg && (
            <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{dataMsg}</span>
            </div>
          )}

          {/* Data Export */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Data Export</h3>
            <p className="text-sm text-gray-500 mb-3">
              Download or email a complete copy of all your SC Bridge data (GDPR right of access).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportDownload}
                disabled={exporting}
                className="btn-primary px-4 py-2 font-display tracking-wider uppercase text-xs flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? 'Exporting...' : 'Download My Data'}
              </button>
              <button
                onClick={handleExportEmail}
                disabled={emailing}
                className="px-4 py-2 font-display tracking-wider uppercase text-xs flex items-center gap-2 border border-sc-border rounded text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {emailing ? 'Sending...' : 'Email My Data'}
              </button>
            </div>
          </div>

          {/* Account Deletion */}
          <div className="border border-sc-danger/30 rounded-lg p-4 bg-sc-danger/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-sc-danger" />
              <h3 className="text-xs font-medium text-sc-danger uppercase tracking-wider">Danger Zone</h3>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>

            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">
                  Type <strong className="text-sc-danger font-mono">DELETE</strong> to confirm:
                </p>
                <div className="flex items-center gap-2 max-w-sm">
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="flex-1 px-4 py-2.5 bg-sc-darker border border-sc-danger/30 rounded text-sm font-mono text-white placeholder-gray-600 focus:border-sc-danger focus:outline-none focus:ring-1 focus:ring-sc-danger/50"
                    autoFocus
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE' || deleting}
                    className="px-4 py-2.5 bg-sc-danger text-white font-display tracking-wider uppercase text-xs rounded hover:bg-sc-danger/80 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Confirm'}
                  </button>
                </div>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-sc-danger/10 border border-sc-danger/30 text-sc-danger font-display tracking-wider uppercase text-xs rounded hover:bg-sc-danger/20 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete My Account
              </button>
            )}
          </div>
        </div>
      </PanelSection>
    </div>
  )
}
