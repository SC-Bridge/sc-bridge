import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useChats, useChat, sendChatMessage, deleteChat } from '../hooks/useAPI'
import { Loader, Send, Plus, Trash2, MessageSquare, AlertCircle } from 'lucide-react'

/**
 * Conversational "Chat about my fleet". Multi-turn, saved per conversation.
 * The provider/model come from the shared selector on the Analysis page.
 */
export default function FleetChat({ provider, model }) {
  const { data: chatsData, refetch: refetchChats } = useChats()
  const chats = chatsData?.chats || []

  const [activeChatId, setActiveChatId] = useState(null)
  const { data: chatData } = useChat(activeChatId)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
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
            <button
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
              className={`group w-full text-left px-3 py-2 rounded text-xs border flex items-center gap-2 transition-all ${
                activeChatId === c.id
                  ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                  : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{c.title || 'Untitled'}</span>
              <Trash2
                className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-sc-danger"
                onClick={(e) => handleDelete(c.id, e)}
              />
            </button>
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
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
    </div>
  )
}
