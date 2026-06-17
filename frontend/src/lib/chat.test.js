import { describe, it, expect } from 'vitest'
import { chatTitle } from './chat'

describe('chatTitle', () => {
  it('returns the trimmed message for short input', () => {
    expect(chatTitle('  Should I buy a miner?  ')).toBe('Should I buy a miner?')
  })

  it('truncates to 80 characters', () => {
    expect(chatTitle('a'.repeat(100))).toHaveLength(80)
  })

  it('handles empty / whitespace-only input', () => {
    expect(chatTitle('   ')).toBe('')
    expect(chatTitle(undefined)).toBe('')
  })
})
