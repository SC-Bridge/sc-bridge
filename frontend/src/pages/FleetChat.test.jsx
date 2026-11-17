import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FleetChat from './FleetChat'

const api = vi.hoisted(() => ({
  chats: [],
  chatDetail: null,
  send: vi.fn(),
}))

vi.mock('../hooks/useAPI', () => ({
  useChats: () => ({ data: { chats: api.chats }, refetch: vi.fn() }),
  useChat: (id) => ({ data: id ? api.chatDetail : null }),
  sendChatMessage: (...args) => api.send(...args),
  deleteChat: vi.fn(),
  renameChat: vi.fn(),
}))
vi.mock('../hooks/useLootDetailPane', () => ({ useLootDetailPane: () => ({ openDetail: vi.fn(), detailNode: null }) }))

const ACCOUNTS = [
  { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
  { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
]

const filterFor = (ids, active = true) => ({
  active,
  selectedIds: new Set(ids),
  isAll: ids.length === ACCOUNTS.length,
  apiParam: ids.length === ACCOUNTS.length ? 'all' : ids.join(','),
})

const sendMessage = async (text = 'hello') => {
  fireEvent.change(screen.getByPlaceholderText(/ask about your fleet/i), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /send/i }))
  await waitFor(() => expect(api.send).toHaveBeenCalled())
}

describe('FleetChat account scope', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn()
    api.chats = []
    api.chatDetail = null
    api.send = vi.fn().mockResolvedValue({ reply: 'ok', chat_id: 9, tools_used: [], accounts: ['Alt'] })
  })

  it("new chat sends the page's account filter", async () => {
    render(<FleetChat provider="anthropic" model="m" accounts={ACCOUNTS} accountFilter={filterFor([2])} />)
    await sendMessage()
    expect(api.send.mock.calls[0][0].accounts).toEqual([2])
  })

  it("sends 'all' when the page filter covers every account", async () => {
    render(<FleetChat provider="anthropic" model="m" accounts={ACCOUNTS} accountFilter={filterFor([1, 2])} />)
    await sendMessage()
    expect(api.send.mock.calls[0][0].accounts).toBe('all')
  })

  it("header shows the chat's scope", async () => {
    api.chats = [{ id: 5, title: 'Saved', provider: 'anthropic', model: 'm' }]
    api.chatDetail = { chat: { id: 5, accounts: ['Alt'] }, messages: [{ role: 'user', content: 'hi' }] }
    render(<FleetChat provider="anthropic" model="m" accounts={ACCOUNTS} accountFilter={filterFor([1, 2])} />)
    expect(screen.getByText(/Scope: All accounts/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Saved'))
    await waitFor(() => expect(screen.getByText(/Scope: Alt/)).toBeInTheDocument())
  })

  it('a changed scope is sent with the next message and flagged until then', async () => {
    api.chats = [{ id: 5, title: 'Saved', provider: 'anthropic', model: 'm' }]
    api.chatDetail = { chat: { id: 5, accounts: null }, messages: [{ role: 'user', content: 'hi' }] }
    render(<FleetChat provider="anthropic" model="m" accounts={ACCOUNTS} accountFilter={filterFor([1, 2])} />)
    fireEvent.click(screen.getByText('Saved'))
    await waitFor(() => expect(screen.getByText(/Scope: All accounts/)).toBeInTheDocument())
    expect(screen.queryByText(/Scope changes from your next message/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Main' }))
    expect(screen.getByText(/Scope: Alt/)).toBeInTheDocument()
    expect(screen.getByText(/Scope changes from your next message/)).toBeInTheDocument()

    await sendMessage()
    expect(api.send.mock.calls[0][0].chat_id).toBe(5)
    expect(api.send.mock.calls[0][0].accounts).toEqual([2])
    await waitFor(() => expect(screen.queryByText(/Scope changes from your next message/)).not.toBeInTheDocument())
  })

  it('an unchanged scope on a saved chat sends no accounts', async () => {
    api.chats = [{ id: 5, title: 'Saved', provider: 'anthropic', model: 'm' }]
    api.chatDetail = { chat: { id: 5, accounts: ['Alt'] }, messages: [{ role: 'user', content: 'hi' }] }
    render(<FleetChat provider="anthropic" model="m" accounts={ACCOUNTS} accountFilter={filterFor([1, 2])} />)
    fireEvent.click(screen.getByText('Saved'))
    await waitFor(() => expect(screen.getByText(/Scope: Alt/)).toBeInTheDocument())
    await sendMessage()
    expect(api.send.mock.calls[0][0].accounts).toBeUndefined()
  })

  it('shows no scope UI and sends no accounts when account UI is off', async () => {
    render(<FleetChat provider="anthropic" model="m" accounts={undefined} accountFilter={filterFor([], false)} />)
    expect(screen.queryByText(/Scope:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /filter by rsi account/i })).not.toBeInTheDocument()
    await sendMessage()
    expect(api.send.mock.calls[0][0].accounts).toBeUndefined()
  })
})
