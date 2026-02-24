import { useState } from 'react'
import { Rocket } from 'lucide-react'

const ASPECT_CLASSES = {
  landscape: 'aspect-video',
  square: 'aspect-square',
  thumbnail: 'w-20 h-12',
}

export default function ShipImage({ src, baseSrc, alt, aspectRatio = 'landscape', hoverZoom = false, className = '' }) {
  // If no direct image but a base variant image is provided, use it with a banner
  const effectiveSrc = src || baseSrc
  const isVariantFallback = !src && !!baseSrc

  const [status, setStatus] = useState(effectiveSrc ? 'loading' : 'error')

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

      {effectiveSrc && status !== 'error' && (
        <img
          src={effectiveSrc}
          alt={alt || ''}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-300 ${
            status === 'loading' ? 'opacity-0' : 'opacity-100'
          } ${hoverZoom ? 'group-hover:scale-105' : ''}`}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
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
