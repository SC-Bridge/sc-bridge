import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import useAccountFilter from './useAccountFilter'

const accounts = [
  { id: 1, label: 'Main', is_primary: 0 },
  { id: 2, label: 'Alt', is_primary: 1 },
  { id: 3, label: 'Third', is_primary: 0 },
]

function setup(accts, url = '/fleet') {
  const wrapper = ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(() => ({ filter: useAccountFilter(accts), loc: useLocation() }), { wrapper })
}

const ids = (r) => [...r.current.filter.selectedIds].sort((a, b) => a - b)

describe('useAccountFilter', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is inactive while accounts are loading', () => {
    const { result } = setup(undefined)
    expect(result.current.filter.active).toBe(false)
    expect(result.current.filter.matches(5)).toBe(true)
    expect(result.current.filter.apiParam).toBeNull()
  })

  it('inactive with fewer than two accounts', () => {
    const { result } = setup([accounts[0]])
    expect(result.current.filter.active).toBe(false)
    expect(result.current.filter.matches(5)).toBe(true)
    expect(result.current.filter.apiParam).toBeNull()
  })

  it('defaults to the primary account without touching the URL', () => {
    const { result } = setup(accounts)
    expect(result.current.filter.active).toBe(true)
    expect(ids(result)).toEqual([2])
    expect(result.current.filter.apiParam).toBe('2')
    expect(result.current.filter.isAll).toBe(false)
    expect(result.current.loc.search).toBe('')
  })

  it('reads accts=all', () => {
    const { result } = setup(accounts, '/fleet?accts=all')
    expect(result.current.filter.isAll).toBe(true)
    expect(ids(result)).toEqual([1, 2, 3])
    expect(result.current.filter.apiParam).toBe('all')
  })

  it('reads a list and drops ids the user does not own', () => {
    expect(ids(setup(accounts, '/fleet?accts=3,1,99').result)).toEqual([1, 3])
    expect(setup(accounts, '/fleet?accts=3,1').result.current.filter.apiParam).toBe('1,3')
    expect(ids(setup(accounts, '/fleet?accts=99').result)).toEqual([2])
  })

  it('uses the remembered selection when the URL has none', () => {
    localStorage.setItem('scb.accountFilter', '1,3')
    expect(ids(setup(accounts).result)).toEqual([1, 3])
  })

  it('URL wins over the remembered selection', () => {
    localStorage.setItem('scb.accountFilter', '1,3')
    expect(ids(setup(accounts, '/fleet?accts=2').result)).toEqual([2])
  })

  it('survives localStorage throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = setup(accounts)
    expect(ids(result)).toEqual([2])
    act(() => result.current.filter.toggle(1))
    expect(ids(result)).toEqual([1, 2])
  })

  it('toggle adds and removes, writing URL and storage', () => {
    const { result } = setup(accounts, '/fleet?accts=1&page=3&sort=name')
    act(() => result.current.filter.toggle(3))
    expect(ids(result)).toEqual([1, 3])
    const params = new URLSearchParams(result.current.loc.search)
    expect(params.get('accts')).toBe('1,3')
    expect(params.get('sort')).toBe('name')
    expect(params.has('page')).toBe(false)
    expect(localStorage.getItem('scb.accountFilter')).toBe('1,3')
    act(() => result.current.filter.toggle(1))
    expect(ids(result)).toEqual([3])
  })

  it('toggling every account on yields all', () => {
    const { result } = setup(accounts, '/fleet?accts=1,2')
    act(() => result.current.filter.toggle(3))
    expect(result.current.filter.isAll).toBe(true)
    expect(result.current.filter.apiParam).toBe('all')
  })

  it('keeps the last account selected', () => {
    const { result } = setup(accounts, '/fleet?accts=1')
    act(() => result.current.filter.toggle(1))
    expect(ids(result)).toEqual([1])
  })

  it('selectAll sets accts=all and remembers it', () => {
    const { result } = setup(accounts)
    act(() => result.current.filter.selectAll())
    expect(result.current.filter.isAll).toBe(true)
    expect(new URLSearchParams(result.current.loc.search).get('accts')).toBe('all')
    expect(localStorage.getItem('scb.accountFilter')).toBe('all')
  })

  it('matches rows by account, and always matches rows with no account', () => {
    const { result } = setup(accounts, '/fleet?accts=1')
    expect(result.current.filter.matches(1)).toBe(true)
    expect(result.current.filter.matches(2)).toBe(false)
    expect(result.current.filter.matches(null)).toBe(true)
  })
})
