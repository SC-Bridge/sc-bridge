import { useState } from 'react'
import ItemImage from '../../components/ItemImage'
import RenderViewer from '../../components/RenderViewer'

/**
 * A loot item's render with a click-through to the large view.
 * `item` carries `render`, `render_variants_kind`, `render_item_key` and `render_variant`
 * from the loot API; without the first three the image shows the placeholder and cannot be
 * opened. A weapon finish opens its base weapon (render_item_key) with the finish
 * (render_variant) selected.
 */
export default function LootRender({ item, title, aspectRatio = 'landscape', size = 512, className = '' }) {
  const [open, setOpen] = useState(false)
  const canOpen = Boolean(item.render && item.render_variants_kind && item.render_item_key)

  return (
    <div>
      <ItemImage
        render={item.render}
        alt={title}
        size={size}
        aspectRatio={aspectRatio}
        hoverZoom
        className={className}
        onOpen={canOpen ? (e) => { e.stopPropagation(); setOpen(true) } : undefined}
      />
      {open && canOpen && (
        // The viewer is a React child of its card, so keep its clicks from selecting the card.
        <div onClick={(e) => e.stopPropagation()}>
          <RenderViewer
            kind={item.render_variants_kind}
            itemKey={item.render_item_key}
            initialVariant={item.render_variant ?? ''}
            title={title}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
