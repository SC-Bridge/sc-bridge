import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useHangarSync from './useHangarSync'

// The extension bridge talks to the page with window.postMessage; the hook
// listens for messages from source 'sc-bridge-sync' on our own origin.
function fromExtension(data) {
  window.dispatchEvent(
    new MessageEvent('message', { data: { source: 'sc-bridge-sync', ...data }, origin: window.location.origin }),
  )
}

const payload = {
  pledges: [{ id: 1, name: 'Pledge' }],
  buyback_pledges: [],
  upgrades: [],
  account: null,
  named_ships: [],
  sync_meta: { extension_version: '0.6.2' },
}

const mapping = {
  error: 'needs_mapping',
  reason: 'no_identity',
  identity: { handle: null, referral_code: null },
  candidate_id: null,
  accounts: [{ id: 7, label: 'Main', rsi_handle: 'Jean', is_placeholder: 0, overlap: 1 }],
  can_add: false,
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body }
}

async function setupToMapping() {
  const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(409, mapping))
  vi.stubGlobal('fetch', fetchMock)
  const hook = renderHook(() => useHangarSync())
  act(() => fromExtension({ type: 'SCBRIDGE_PONG', version: '0.6.2' }))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))

  act(() => hook.result.current.startSync())
  expect(window.postMessage).toHaveBeenCalledWith({ type: 'SCBRIDGE_SYNC_REQUEST', source: 'scbridge-app' }, '*')
  await act(async () => fromExtension({ type: 'SCBRIDGE_SYNC_RESPONSE', payload: structuredClone(payload) }))
  await waitFor(() => expect(hook.result.current.status).toBe('needs_mapping'))
  return { hook, fetchMock }
}

describe('useHangarSync mapping flow', () => {
  beforeEach(() => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('409 needs_mapping sets status needs_mapping with the mapping body', async () => {
    const { hook, fetchMock } = await setupToMapping()
    expect(hook.result.current.mapping).toEqual(mapping)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(payload)
    hook.unmount()
  })

  it('resolveMapping re-posts the same payload with the target', async () => {
    const { hook, fetchMock } = await setupToMapping()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { imported: 1, rsi_account_id: 7 }))

    await act(async () => { await hook.result.current.resolveMapping({ mode: 'map', rsi_account_id: 7 }) })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/import/hangar-sync')
    expect(JSON.parse(init.body)).toEqual({ ...payload, target: { mode: 'map', rsi_account_id: 7 } })
    expect(hook.result.current.status).toBe('complete')
    expect(hook.result.current.mapping).toBeNull()
    hook.unmount()
  })

  it('a 429 on the re-post ends in error with the server message', async () => {
    const { hook, fetchMock } = await setupToMapping()
    const message = 'Sync rate limited — please wait 5 minutes between syncs'
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: message }))

    await act(async () => { await hook.result.current.resolveMapping({ mode: 'map', rsi_account_id: 7 }) })

    expect(hook.result.current.status).toBe('error')
    expect(hook.result.current.error).toBe(message)
    expect(hook.result.current.mapping).toBeNull()
    hook.unmount()
  })

  it('cancel goes back to ready and drops the held payload', async () => {
    const { hook, fetchMock } = await setupToMapping()

    act(() => hook.result.current.cancelMapping())
    expect(hook.result.current.status).toBe('ready')
    expect(hook.result.current.mapping).toBeNull()

    await act(async () => { await hook.result.current.resolveMapping({ mode: 'map', rsi_account_id: 7 }) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    hook.unmount()
  })
})
