/**
 * Derive a chat title from the first user message (mirrors the backend's
 * slice(0, 80)). Used for optimistic display before the server responds.
 */
export function chatTitle(message) {
  return (message || '').trim().slice(0, 80)
}
