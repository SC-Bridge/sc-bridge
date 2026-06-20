import { describe, it, expect } from 'vitest'
import { resolveActiveModel } from './llmModels'

/**
 * Model selection must be robust to LIVE model lists (varying length/order),
 * unlike the old hardcoded `models[1]?.id` index heuristic.
 */
describe('resolveActiveModel', () => {
  const models = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ]

  it('keeps the user-selected model when it exists in the live list', () => {
    expect(resolveActiveModel(models, 'gpt-4o-mini')).toBe('gpt-4o-mini')
  })

  it('falls back to the first model when the selected one is no longer offered', () => {
    expect(resolveActiveModel(models, 'gpt-3.5-turbo-retired')).toBe('gpt-4o')
  })

  it('falls back to the first model when nothing is selected', () => {
    expect(resolveActiveModel(models, null)).toBe('gpt-4o')
  })

  it('returns null for an empty/missing list', () => {
    expect(resolveActiveModel([], 'gpt-4o')).toBeNull()
    expect(resolveActiveModel(null, 'gpt-4o')).toBeNull()
  })
})
