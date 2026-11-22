import { useState } from 'react'
import ItemImage from '../../components/ItemImage'
import RenderViewer from '../../components/RenderViewer'

/**
 * A loot item's render with a click-through to the large view.
 * `item` carries `render`, `render_variants_kind` and `render_item_key` from the loot API;
 * without them the image shows the placeholder and cannot be opened.
 */
export default function LootRender({ item, title, aspectRatio = 'landscape', size = 512, className = '' }) {
  const [open, setOpen] = useState(false)
  const canOpen = Boolean(item.render && item.render_variants_kind && item.render_item_key)

  return (
    // The viewer is a React child of its card, so keep its clicks from selecting the card.
    <div onClick={(e) => e.stopPropagation()}>
      <ItemImage
        render={item.render}
        alt={title}
        size={size}
        aspectRatio={aspectRatio}
        hoverZoom
        className={className}
        onOpen={canOpen ? () => setOpen(true) : undefined}
      />
      {open && canOpen && (
        <RenderViewer
          kind={item.render_variants_kind}
          itemKey={item.render_item_key}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
