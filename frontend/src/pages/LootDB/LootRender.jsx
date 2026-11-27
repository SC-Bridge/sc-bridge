import RenderThumb from '../../components/RenderThumb'

/**
 * A loot item's render with a click-through to the large view.
 * `item` carries `render`, `render_variants_kind`, `render_item_key` and `render_variant`
 * from the loot API; without the first three the image shows the placeholder and cannot be
 * opened. A weapon finish opens its base weapon (render_item_key) with the finish
 * (render_variant) selected.
 */
export default function LootRender({ item, title, aspectRatio = 'landscape', size = 512, className = '' }) {
  return (
    <RenderThumb
      render={item.render}
      kind={item.render_variants_kind}
      itemKey={item.render_item_key}
      variant={item.render_variant ?? ''}
      title={title}
      aspectRatio={aspectRatio}
      size={size}
      hoverZoom
      className={className}
    />
  )
}
