import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useChats, useChat, sendChatMessage, deleteChat, renameChat } from '../hooks/useAPI'
import { useLootDetailPane } from '../hooks/useLootDetailPane'
import { parseLootUuid } from '../lib/lootLinks'
import { Loader, Send, Plus, Trash2, MessageSquare, AlertCircle, Pencil } from 'lucide-react'

/**
 * Conversational "Chat about my fleet". Multi-turn, saved per conversation.
 * The provider/model come from the shared selector on the Analysis page.
 */
export default function FleetChat({ provider, model }) {
  const { data: chatsData, refetch: refetchChats } = useChats()
  const chats = chatsData?.chats || []
  const { openDetail, detailNode } = useLootDetailPane()

  // Component links (/loot/<uuid>) open the item-detail pane in place instead
  // of navigating away; all other links open normally in a new tab.
  const mdComponents = {
    a: ({ href, children, ...props }) => {
      const uuid = parseLootUuid(href)
      if (uuid) {
        return (
          <a
            href={href}
            onClick={(e) => { e.preventDefault(); openDetail(uuid) }}
            className="text-sc-accent underline decoration-dotted cursor-pointer"
          >
            {children}
          </a>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    },
  }

  const [activeChatId, setActiveChatId] = useState(null)
  const { data: chatData } = useChat(activeChatId)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const threadRef = useRef(null)

  // Load a saved conversation when one is selected.
  useEffect(() => {
    if (activeChatId && chatData?.messages) {
      setMessages(chatData.messages.map((m) => ({ role: m.role, content: m.content })))
    }
  }, [activeChatId, chatData])

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const newChat = () => {
    setActiveChatId(null)
    setMessages([])
    setError(null)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setSending(true)
    try {
      const res = await sendChatMessage({
        chat_id: activeChatId || undefined,
        provider,
        model,
        message: text,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, toolsUsed: res.tools_used }])
      if (!activeChatId && res.chat_id) setActiveChatId(res.chat_id)
      refetchChats()
    } catch (e) {
      setError(e.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    try {
      await deleteChat(id)
      if (id === activeChatId) newChat()
      refetchChats()
    } catch { /* ignore */ }
  }

  const startRename = (c, e) => {
    e.stopPropagation()
    setEditingId(c.id)
    setEditingTitle(c.title || '')
  }

  const submitRename = async () => {
    const id = editingId
    const title = editingTitle.trim()
    setEditingId(null)
    if (!id || !title) return
    try {
      await renameChat(id, title)
      refetchChats()
    } catch { /* ignore */ }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="grid md:grid-cols-[210px_1fr] gap-4">
      {/* History */}
      <aside className="space-y-2">
        <button onClick={newChat} className="btn-ghost w-full flex items-center justify-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> New chat
        </button>
        <div className="space-y-1">
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => editingId !== c.id && setActiveChatId(c.id)}
              className={`group w-full text-left px-3 py-2 rounded text-xs border flex items-center gap-2 transition-all cursor-pointer ${
                activeChatId === c.id
                  ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                  : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editingTitle}
                  maxLength={80}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitRename() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                  }}
                  className="flex-1 min-w-0 bg-sc-darker border border-sc-accent/40 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:outline-none"
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{c.title || 'Untitled'}</span>
                  <Pencil
                    className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100"
                    onClick={(e) => startRename(c, e)}
                  />
                  <Trash2
                    className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-sc-danger"
                    onClick={(e) => handleDelete(c.id, e)}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Thread + input */}
      <div className="panel flex flex-col h-[60vh]">
        <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Ask anything about your fleet.</p>
              <p className="text-xs text-gray-600 mt-1">
                e.g. "What should I buy next for mining?" or "Is my Hermes worth keeping?"
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-sc-accent/15 text-gray-100'
                    : 'bg-white/[0.04] text-gray-300'
                }`}
              >
                {m.role === 'user' ? (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                ) : (
                  <div className="prose-fleet prose-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={mdComponents}>
                      {m.content}
                    </ReactMarkdown>
                    {Array.isArray(m.toolsUsed) && m.toolsUsed.length > 0 && (
                      <div className="mt-1.5 text-[11px] text-gray-500 not-prose">
                        🔧 looked up: {[...new Set(m.toolsUsed)].join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.04] text-gray-400 rounded-lg px-3.5 py-2.5 text-sm flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin" /> Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 border-t border-sc-border flex items-center gap-2 text-xs text-sc-danger">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="border-t border-sc-border p-3 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your fleet…"
            rows={1}
            maxLength={2000}
            className="flex-1 bg-sc-darker border border-sc-border rounded-lg px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-sc-accent/40 focus:ring-1 focus:ring-sc-accent/20 transition-colors resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </div>
      </div>

      {/* Item-detail slide-over — opens in place when a component link is clicked */}
      {detailNode}
    </div>
  )
}
