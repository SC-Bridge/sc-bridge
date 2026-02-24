import React, { useState, useEffect, useCallback } from 'react'
import { Users, Shield, Ban, Trash2, AlertCircle, UserCheck } from 'lucide-react'
import { authClient, useSession } from '../lib/auth-client'
import useTimezone from '../hooks/useTimezone'
import { formatDate } from '../lib/dates'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import PanelSection from '../components/PanelSection'

const ROLES = ['user', 'admin', 'super_admin']

export default function UserManagement() {
  const { timezone } = useTimezone()
  const { data: session } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await authClient.admin.listUsers({ query: { limit: 100 } })
      setUsers(result.data?.users || [])
    } catch (err) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSetRole = async (userId, newRole) => {
    setActionLoading(userId)
    setActionError(null)
    try {
      await authClient.admin.setRole({ userId, role: newRole })
      await fetchUsers()
    } catch (err) {
      setActionError(err.message || 'Failed to update role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBan = async (userId, banned) => {
    setActionLoading(userId)
    setActionError(null)
    try {
      if (banned) {
        await authClient.admin.banUser({ userId })
      } else {
        await authClient.admin.unbanUser({ userId })
      }
      await fetchUsers()
    } catch (err) {
      setActionError(err.message || `Failed to ${banned ? 'ban' : 'unban'} user`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}"? This cannot be undone.`)) return
    setActionLoading(userId)
    setActionError(null)
    try {
      await authClient.admin.removeUser({ userId })
      await fetchUsers()
    } catch (err) {
      setActionError(err.message || 'Failed to delete user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleImpersonate = async (userId) => {
    setActionLoading(userId)
    setActionError(null)
    try {
      await authClient.admin.impersonateUser({ userId })
      window.location.href = '/'
    } catch (err) {
      setActionError(err.message || 'Failed to impersonate user')
      setActionLoading(null)
    }
  }

  if (loading) return <LoadingState variant="skeleton" />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="USER MANAGEMENT"
        subtitle={`${users.length} registered user${users.length !== 1 ? 's' : ''}`}
      />

      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {error ? (
        <div className="text-center text-gray-500 text-sm py-8">
          Failed to load users: {error}
        </div>
      ) : (
        <PanelSection title="Users" icon={Users} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Registered users</caption>
              <thead>
                <tr className="border-b border-sc-border/50">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                  <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-border/30">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-sm text-white">{u.name || '—'}</td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-300">{u.email}</td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role || 'user'}
                        onChange={(e) => handleSetRole(u.id, e.target.value)}
                        disabled={actionLoading === u.id}
                        className="bg-sc-darker border border-sc-border rounded px-2 py-1 text-xs text-gray-300 focus:border-sc-accent focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      {u.banned ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-sc-danger">
                          <Ban className="w-3 h-3" /> Banned
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-sc-success">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-500">
                      {formatDate(u.createdAt, timezone)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleImpersonate(u.id)}
                          disabled={actionLoading === u.id || u.id === session?.user?.id}
                          title="Impersonate"
                          className="p-1.5 rounded text-sc-accent hover:bg-sc-accent/10 transition-colors disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleBan(u.id, !u.banned)}
                          disabled={actionLoading === u.id}
                          title={u.banned ? 'Unban' : 'Ban'}
                          className={`p-1.5 rounded transition-colors ${
                            u.banned
                              ? 'text-sc-success hover:bg-sc-success/10'
                              : 'text-sc-warn hover:bg-sc-warn/10'
                          } disabled:opacity-50`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.name || u.email)}
                          disabled={actionLoading === u.id}
                          title="Delete user"
                          className="p-1.5 rounded text-sc-danger hover:bg-sc-danger/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelSection>
      )}
    </div>
  )
}
