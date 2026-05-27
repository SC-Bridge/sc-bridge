import React, { useState, useEffect, useCallback } from 'react'
import { Upload, Trash2, Power, Loader, FileText, Pencil, Save, X, RefreshCw } from 'lucide-react'
import PanelSection from '../../components/PanelSection'
import ConfirmDialog from '../../components/ConfirmDialog'

// Admin management for community localization overlay packs:
// upload/replace (PUT), activate/deactivate (PATCH), delete (DELETE).
export default function AdminPacks() {
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', label: '', description: '', version_code: '', content: '' })
  const [uploading, setUploading] = useState(false)
  const [busyName, setBusyName] = useState(null)
  const [message, setMessage] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editName, setEditName] = useState(null)
  const [editForm, setEditForm] = useState({ label: '', description: '', sort_order: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/localization/overlay-packs', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to load packs')
      const data = await res.json()
      setPacks(data.packs || [])
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (type, text) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 4000) }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, content: String(reader.result || '') }))
    reader.readAsText(file)
  }

  const upload = async () => {
    if (!form.name || !form.label || !form.version_code || form.content.length < 10) {
      flash('error', 'Name, label, version, and pack content (>10 chars) are required')
      return
    }
    setUploading(true)
    try {
      const params = new URLSearchParams({ name: form.name, label: form.label, version_code: form.version_code })
      if (form.description) params.set('description', form.description)
      const res = await fetch(`/api/admin/localization/overlay-pack?${params}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'text/plain' },
        body: form.content,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      flash('success', `Stored '${form.name}' — ${data.keyCount} keys, ${data.sizeKB}KB`)
      setForm({ name: '', label: '', description: '', version_code: form.version_code, content: '' })
      load()
    } catch (e) {
      flash('error', e.message)
    } finally {
      setUploading(false)
    }
  }

  const toggle = async (pack) => {
    setBusyName(pack.name)
    try {
      const res = await fetch(`/api/admin/localization/overlay-pack/${encodeURIComponent(pack.name)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !pack.is_active }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Toggle failed')
      load()
    } catch (e) {
      flash('error', e.message)
    } finally {
      setBusyName(null)
    }
  }

  const startEdit = (p) => {
    setEditName(p.name)
    setEditForm({ label: p.label || '', description: p.description || '', sort_order: p.sort_order ?? 0 })
  }

  const saveMeta = async () => {
    const name = editName
    setBusyName(name)
    try {
      const res = await fetch(`/api/admin/localization/overlay-pack/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label,
          description: editForm.description || null,
          sort_order: Number(editForm.sort_order) || 0,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed')
      setEditName(null)
      load()
    } catch (e) {
      flash('error', e.message)
    } finally {
      setBusyName(null)
    }
  }

  const [ingesting, setIngesting] = useState(false)
  const ingestNow = async () => {
    setIngesting(true)
    try {
      const res = await fetch('/api/admin/localization/ingest', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Ingest failed')
      const detail = body.status === 'ingested'
        ? `refreshed ${body.versionCode} from ${body.source} — ${body.keyCount} keys (Δ${body.delta >= 0 ? '+' : ''}${body.delta})`
        : `${body.status}: ${body.reason}`
      flash('success', `Base ingest — ${detail}`)
    } catch (e) {
      flash('error', e.message)
    } finally {
      setIngesting(false)
    }
  }

  const doDelete = async () => {
    const name = deleteTarget?.name
    setDeleteTarget(null)
    if (!name) return
    setBusyName(name)
    try {
      const res = await fetch(`/api/admin/localization/overlay-pack/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed')
      flash('success', `Deleted '${name}'`)
      load()
    } catch (e) {
      flash('error', e.message)
    } finally {
      setBusyName(null)
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <p className={`text-xs font-mono ${message.type === 'success' ? 'text-sc-success' : 'text-sc-danger'}`}>{message.text}</p>
      )}

      <PanelSection title="Localization Base (auto-ingest)" icon={RefreshCw}>
        <div className="p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Pull a fresh vanilla base global.ini from the community sources (BeltaKoda → Dymerz) for the current default version. Runs hourly in production; trigger it here to test or force a refresh.</p>
          <button onClick={ingestNow} disabled={ingesting} className="btn-primary flex items-center gap-2 text-sm px-3 py-2 shrink-0 disabled:opacity-50">
            {ingesting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {ingesting ? 'Ingesting…' : 'Refresh base now'}
          </button>
        </div>
      </PanelSection>

      <PanelSection title="Upload / Replace Pack" icon={Upload}>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="name (a-z0-9-, e.g. starstrings)"
              className="px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50" />
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Label (e.g. MrKraken StarStrings)"
              className="px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50" />
            <input value={form.version_code} onChange={(e) => setForm((f) => ({ ...f, version_code: e.target.value }))}
              placeholder="version_code (e.g. 4.8.0-live)"
              className="px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50" />
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="description (optional)"
              className="px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50" />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <label className="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-gray-200">
              <FileText className="w-3.5 h-3.5" />
              <span>Load .ini file</span>
              <input type="file" accept=".ini,.txt" onChange={onFile} className="hidden" />
            </label>
            <span>or paste below · {form.content.split('\n').filter((l) => l.includes('=')).length} keys</span>
          </div>
          <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={6} placeholder="key=value lines…"
            className="w-full px-3 py-2 bg-black/40 border border-sc-border rounded text-xs font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50 resize-y" />
          <button onClick={upload} disabled={uploading} className="btn-primary flex items-center gap-2 text-sm px-3 py-2 disabled:opacity-50">
            {uploading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Upload Pack'}
          </button>
        </div>
      </PanelSection>

      <PanelSection title={`Packs (${packs.length})`} icon={FileText}>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader className="w-5 h-5 animate-spin text-sc-accent" /></div>
          ) : packs.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">No packs loaded yet.</p>
          ) : (
            <div className="divide-y divide-sc-border">
              {packs.map((p) => (
                <div key={p.name} className="py-2">
                  {editName === p.name ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <input value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                          placeholder="label"
                          className="w-full px-2 py-1 bg-sc-darker border border-sc-accent/30 rounded text-sm text-gray-200 focus:outline-none focus:border-sc-accent/60" />
                        <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          placeholder="description"
                          className="w-full px-2 py-1 bg-sc-darker border border-sc-border rounded text-xs text-gray-300 focus:outline-none focus:border-sc-accent/40" />
                        <input type="number" value={editForm.sort_order} onChange={(e) => setEditForm((f) => ({ ...f, sort_order: e.target.value }))}
                          placeholder="sort order"
                          className="w-28 px-2 py-1 bg-sc-darker border border-sc-border rounded text-xs text-gray-300 focus:outline-none focus:border-sc-accent/40" />
                      </div>
                      <button onClick={saveMeta} disabled={busyName === p.name}
                        className="p-1.5 rounded bg-sc-accent/15 text-sc-accent border border-sc-accent/30 cursor-pointer disabled:opacity-40" title="Save">
                        {busyName === p.name ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setEditName(null)} disabled={busyName === p.name}
                        className="p-1.5 rounded border border-white/[0.08] text-gray-400 cursor-pointer disabled:opacity-40" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200">{p.label}</span>
                          <code className="text-[10px] font-mono text-gray-500">{p.name}</code>
                          {!p.is_active && <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-gray-700/50 text-gray-400">inactive</span>}
                        </div>
                        <div className="text-[11px] text-gray-500">{p.version_code} · {p.key_count} keys · sort {p.sort_order ?? 0}</div>
                      </div>
                      <button onClick={() => startEdit(p)} disabled={busyName === p.name}
                        className="p-1.5 rounded border border-white/[0.08] text-gray-500 hover:text-sc-accent cursor-pointer disabled:opacity-40" title="Edit metadata">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggle(p)} disabled={busyName === p.name}
                        className={`p-1.5 rounded border cursor-pointer disabled:opacity-40 ${p.is_active ? 'border-sc-accent/30 text-sc-accent' : 'border-white/[0.08] text-gray-500'}`}
                        title={p.is_active ? 'Deactivate' : 'Activate'}>
                        {busyName === p.name ? <Loader className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setDeleteTarget(p)} disabled={busyName === p.name}
                        className="p-1.5 rounded border border-white/[0.08] text-gray-500 hover:text-sc-danger cursor-pointer disabled:opacity-40" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PanelSection>

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Pack"
        message={`Delete overlay pack "${deleteTarget?.label}" (${deleteTarget?.name})? This removes its metadata and stored content. Users with it enabled will simply stop getting its overrides.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}
