export async function checkGravatar(email: string): Promise<string | null> {
  const normalized = email.toLowerCase().trim()
  const msgBuffer = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const url = `https://www.gravatar.com/avatar/${hashHex}?d=404&s=80`
  const resp = await fetch(url, { method: 'HEAD' })
  return resp.ok ? `https://www.gravatar.com/avatar/${hashHex}?s=80` : null
}
