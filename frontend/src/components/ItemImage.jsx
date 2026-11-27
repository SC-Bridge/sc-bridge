import { useState } from 'react'
import { renderUrl } from '../lib/renders'

const ASPECT_CLASSES = {
  landscape: 'aspect-video',
  square: 'aspect-square',
  thumbnail: 'w-20 h-12',
  'thumbnail-lg': 'w-28 h-16',
  // Square, for table rows and dense lists; its placeholder is blank so rows stay aligned.
  row: 'w-10 h-10 shrink-0 rounded',
}

const FIXED_SIZES = new Set(['thumbnail', 'thumbnail-lg', 'row'])

// Build a chain of URLs to try in order, deduplicating identical values.
function buildChain(urls) {
  const seen = new Set()
  const chain = []
  for (const url of urls) {
    if (url && !seen.has(url)) {
      seen.add(url)
      chain.push(url)
    }
  }
  return chain
}

/**
 * Shows an item image: game render first, then src, fallbackSrc and baseSrc.
 * `placeholderContent` (optional) replaces the default text placeholder, e.g. ShipImage's Rocket icon.
 */
function ItemImageInner({
  render,
  src,
  fallbackSrc,
  baseSrc,
  alt,
  size = 512,
  aspectRatio = 'landscape',
  hoverZoom = false,
  className = '',
  placeholder = 'none',
  placeholderContent = null,
  placeholderLabel = null,
  onOpen,
}) {
  const rUrl = renderUrl(render, size)
  const chain = buildChain([rUrl, src, fallbackSrc, baseSrc])
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState(chain.length > 0 ? 'loading' : 'error')

  const currentSrc = chain[idx] ?? null
  const isRender = currentSrc !== null && currentSrc === rUrl
  // Show "Variant image unavailable" banner only when we've fallen through to baseSrc
  const isVariantFallback = currentSrc === baseSrc && currentSrc !== src && !isRender

  const handleError = () => {
    if (idx + 1 < chain.length) {
      setIdx(idx + 1)
      // Keep status as 'loading' — skeleton stays visible while next URL loads
    } else {
      setStatus('error')
    }
  }

  const aspectClass = ASPECT_CLASSES[aspectRatio] || ASPECT_CLASSES.landscape
  const isFixedSize = FIXED_SIZES.has(aspectRatio)
  const placeholderText = placeholder === 'no-model' ? 'No image in game data' : 'No image yet'

  const img = currentSrc && status !== 'error' && (
    <img
      src={currentSrc}
      alt={alt || ''}
      loading="lazy"
      className={`w-full h-full ${isRender ? 'object-contain' : 'object-cover'} transition-transform duration-300 ${
        status === 'loading' ? 'opacity-0' : 'opacity-100'
      } ${hoverZoom ? 'group-hover:scale-105' : ''}`}
      onLoad={() => setStatus('loaded')}
      onError={handleError}
    />
  )

  const canOpen = Boolean(onOpen) && isRender && status === 'loaded'

  return (
    <div className={`relative overflow-hidden bg-sc-darker/50 ${isFixedSize ? aspectClass : `w-full ${aspectClass}`} ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 skeleton" />
      )}

      {status === 'error' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-sc-darker/50"
          role="img"
          aria-label={alt ? `${alt} — image unavailable` : (placeholderLabel || 'Image unavailable')}
        >
          {placeholderContent || (aspectRatio !== 'row' && (
            <span className={`text-sc-border/80 text-center px-2 ${isFixedSize ? 'text-[9px]' : 'text-xs'}`}>
              {placeholderText}
            </span>
          ))}
        </div>
      )}

      {canOpen ? (
        <button
          type="button"
          aria-label={`Open large view of ${alt || 'image'}`}
          onClick={onOpen}
          className="block w-full h-full cursor-zoom-in"
        >
          {img}
        </button>
      ) : img}

      {isVariantFallback && status === 'loaded' && !isFixedSize && (
        <div className="absolute bottom-0 inset-x-0 bg-black/70 px-2 py-0.5 text-center">
          <span className="text-[10px] font-mono text-gray-400 tracking-wide uppercase">Variant image unavailable</span>
        </div>
      )}
    </div>
  )
}

// Keyed on the URL chain so a re-render with different sources starts from a clean loading state.
export default function ItemImage(props) {
  const { render, src, fallbackSrc, baseSrc, size = 512 } = props
  const chainKey = [renderUrl(render, size), src, fallbackSrc, baseSrc].join('|')
  return <ItemImageInner key={chainKey} {...props} />
}
