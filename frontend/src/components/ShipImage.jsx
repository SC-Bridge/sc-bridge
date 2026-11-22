import { Rocket } from 'lucide-react'
import ItemImage from './ItemImage'

// Ship images: same behaviour as ItemImage, with a Rocket icon as the placeholder.
export default function ShipImage({ aspectRatio = 'landscape', ...props }) {
  const isFixedSize = aspectRatio === 'thumbnail' || aspectRatio === 'thumbnail-lg'
  return (
    <ItemImage
      {...props}
      aspectRatio={aspectRatio}
      placeholderLabel="Ship image unavailable"
      placeholderContent={
        <Rocket className={`text-sc-border/60 ${isFixedSize ? 'w-5 h-5' : 'w-8 h-8'}`} aria-hidden="true" />
      }
    />
  )
}
