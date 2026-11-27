import { useState } from 'react'
import ItemImage from './ItemImage'
import RenderViewer from './RenderViewer'

/**
 * An item's render with a click-through to the large view, for any page.
 * `render` is the API's render ref; `kind` + `itemKey` (+ `variant`) say which item_renders
 * set the large view loads. Without a render, or without kind and key, it cannot open.
 * A click that opens the viewer, and clicks inside the viewer, stop here, so a clickable
 * row or card around it is not triggered; a click on the placeholder still reaches it.
 * The opening click is also cancelled, so a surrounding link is not followed.
 */
export default function RenderThumb({
  render,
  kind,
  itemKey,
  variant = '',
  title,
  src,
  aspectRatio = 'row',
  size = 512,
  hoverZoom = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const canOpen = Boolean(render && kind && itemKey)

  return (
    <div>
      <ItemImage
        render={render}
        src={src}
        alt={title}
        size={size}
        aspectRatio={aspectRatio}
        hoverZoom={hoverZoom}
        className={className}
        onOpen={canOpen ? (e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) } : undefined}
      />
      {open && canOpen && (
        // The viewer is portalled to <body> but is still a React child here, so its clicks
        // would bubble to the row or card; stop them.
        <div onClick={(e) => e.stopPropagation()}>
          <RenderViewer
            kind={kind}
            itemKey={itemKey}
            initialVariant={variant ?? ''}
            title={title}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
