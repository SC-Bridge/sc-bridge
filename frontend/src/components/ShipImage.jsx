import { useState } from 'react'
import { Rocket } from 'lucide-react'

const ASPECT_CLASSES = {
  landscape: 'aspect-video',
  square: 'aspect-square',
  thumbnail: 'w-20 h-12',
}

// Build a chain of URLs to try in order, deduplicating adjacent identical values.
function buildChain(src, fallbackSrc, baseSrc) {
  const seen = new Set()
  const chain = []
  for (const url of [src, fallbackSrc, baseSrc]) {
    if (url && !seen.has(url)) {
      seen.add(url)
      chain.push(url)
    }
  }
  return chain
}

export default function ShipImage({ src, fallbackSrc, baseSrc, alt, aspectRatio = 'landscape', hoverZoom = false, className = '' }) {
  const chain = buildChain(src, fallbackSrc, baseSrc)
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState(chain.length > 0 ? 'loading' : 'error')

  const currentSrc = chain[idx] ?? null
  // Show "Variant image unavailable" banner only when we've fallen through to baseSrc
  const isVariantFallback = currentSrc === baseSrc && currentSrc !== src

  const handleError = () => {
    if (idx + 1 < chain.length) {
      setIdx(idx + 1)
      // Keep status as 'loading' — skeleton stays visible while next URL loads
    } else {
      setStatus('error')
    }
  }

  const aspectClass = ASPECT_CLASSES[aspectRatio] || ASPECT_CLASSES.landscape
  const isFixedSize = aspectRatio === 'thumbnail'

  return (
    <div className={`relative overflow-hidden bg-sc-darker/50 ${isFixedSize ? aspectClass : `w-full ${aspectClass}`} ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 skeleton" />
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-sc-darker/50" role="img" aria-label={alt ? `${alt} — image unavailable` : 'Ship image unavailable'}>
          <Rocket className={`text-sc-border/60 ${isFixedSize ? 'w-5 h-5' : 'w-8 h-8'}`} aria-hidden="true" />
        </div>
      )}

      {currentSrc && status !== 'error' && (
        <img
          src={currentSrc}
          alt={alt || ''}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-300 ${
            status === 'loading' ? 'opacity-0' : 'opacity-100'
          } ${hoverZoom ? 'group-hover:scale-105' : ''}`}
          onLoad={() => setStatus('loaded')}
          onError={handleError}
        />
      )}

      {isVariantFallback && status === 'loaded' && !isFixedSize && (
        <div className="absolute bottom-0 inset-x-0 bg-black/70 px-2 py-0.5 text-center">
          <span className="text-[10px] font-mono text-gray-400 tracking-wide uppercase">Variant image unavailable</span>
        </div>
      )}
    </div>
  )
}
