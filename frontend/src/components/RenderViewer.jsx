import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useRenderVariants } from '../hooks/useRenderVariants'
import { renderUrl } from '../lib/renders'
import ItemImage from './ItemImage'

// Keep the first entry for each hash; variants that share an image appear once.
function dedupeByHash(variants) {
  const seen = new Set()
  return variants.filter((v) => {
    if (seen.has(v.hash)) return false
    seen.add(v.hash)
    return true
  })
}

/**
 * Large render view: the 2048 image of the selected variant with a strip of 512 thumbnails.
 * The selected variant is mirrored to `?render=<variant>` (history replaced) and removed again by the close handler.
 * Not `view`: pages already use that for their own layout.
 */
export default function RenderViewer({ kind, itemKey, initialVariant = '', title, onClose }) {
  const { variants, loading } = useRenderVariants(kind, itemKey)
  const [searchParams, setSearchParams] = useSearchParams()
  const items = useMemo(() => dedupeByHash(variants), [variants])
  const [selected, setSelected] = useState(() => searchParams.get('render') ?? initialVariant)
  const dialogRef = useRef(null)

  // Resolve against every variant first: the requested one may share a hash with an earlier entry.
  const requested = variants.find((v) => v.variant === selected)
  const index = requested ? Math.max(0, items.findIndex((v) => v.hash === requested.hash)) : 0
  const current = items[index] ?? null
  const [failure, setFailure] = useState({ hash: null, stage: 0 })
  // 0 = 2048 render, 1 = 512 render, 2 = placeholder; resets when the shown hash changes
  const stage = current && failure.hash === current.hash ? failure.stage : 0

  const select = useCallback(
    (i) => {
      const next = items[i]
      if (!next) return
      setSelected(next.variant)
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('render', next.variant)
          return p
        },
        { replace: true },
      )
    },
    [items, setSearchParams],
  )

  // Every way of closing (Esc, backdrop, close button) removes ?render= first.
  const close = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('render')
        return p
      },
      { replace: true },
    )
    onClose?.()
  }, [setSearchParams, onClose])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') select(Math.min(index + 1, items.length - 1))
      else if (e.key === 'ArrowLeft') select(Math.max(index - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, items.length, select, close])

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  const caption = current ? current.name || (current.variant === '' ? title : current.variant) : title

  // Portal to <body>: an ancestor with backdrop-filter or transform (e.g. a .panel card)
  // becomes the containing block for position:fixed and would clip the overlay to itself.
  // React events still bubble through the component tree, so callers' handlers keep working.
  return createPortal(
    <div
      data-testid="render-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? `${title} renders` : 'Renders'}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-5xl flex-col gap-3 rounded-lg bg-sc-darker p-4 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {current && stage < 2 ? (
            <img
              src={renderUrl(current, stage === 0 ? 2048 : 512)}
              onError={() => setFailure({ hash: current.hash, stage: stage + 1 })}
              alt={caption || ''}
              width={current.width}
              height={current.height}
              style={{ maxWidth: current.width }}
              className="h-auto max-h-[70vh] w-full object-contain"
            />
          ) : current ? (
            <p className="py-16 text-sm text-gray-400">Image unavailable</p>
          ) : (
            <p className="py-16 text-sm text-gray-400">{loading ? 'Loading renders…' : 'No renders available'}</p>
          )}
        </div>

        <p data-testid="caption" className="text-center text-sm text-gray-300">
          {caption}
        </p>

        {items.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((v, i) => {
              const label = v.name || (v.variant === '' ? title : v.variant)
              return (
                <button
                  key={v.hash}
                  type="button"
                  aria-label={`Show ${label}`}
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => select(i)}
                  className={`shrink-0 rounded border-2 ${i === index ? 'border-sc-accent' : 'border-transparent'}`}
                >
                  <ItemImage render={v} alt={label} aspectRatio="thumbnail-lg" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
