import { useAPI } from './useAPI'

// Every published render variant of one item, from GET /api/renders/:kind/:itemKey.
export function useRenderVariants(kind, itemKey) {
  const skip = !kind || !itemKey
  const path = `/renders/${encodeURIComponent(kind || '')}/${encodeURIComponent(itemKey || '')}`
  const { data, loading, error } = useAPI(path, { skip })
  return { variants: data?.variants ?? [], loading, error }
}
