import { Bookmark, BookmarkPlus, Check, Package, SlidersHorizontal } from 'lucide-react'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS, effectiveCategory, humanizeRawDisplayName } from '../../lib/lootDisplay'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'
import ItemCardStats from './ItemCardStats'

export default function ItemCard({ item, collectionQty, craftedQty = 0, savedBuildCount = 0, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onSelect }) {
  const rs = rarityStyle(item.rarity)
  const eCat = effectiveCategory(item)
  const catStyle = CATEGORY_BADGE_STYLES[eCat] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[eCat] || eCat
  const isCollected = collectionQty > 0

  return (
    <div
      className="panel p-3 flex flex-col gap-1.5 cursor-pointer hover:border-sc-border/80 transition-all duration-150 relative"
      onClick={() => onSelect(item.uuid)}
    >
      {/* Collected indicator */}
      {isCollected && (
        <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-emerald-500/80 flex items-center justify-center z-10">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      {/* Top row: category badge + wishlist + rarity */}
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
          {catLabel}
        </span>
        <div className="flex-1" />
        {isAuthed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWishlist(item.uuid, wishlisted) }}
            className={`flex items-center justify-center p-1 -m-1 rounded transition-all duration-150 shrink-0 ${
              wishlisted ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'
            }`}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            {wishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          </button>
        )}
        {item.rarity && item.rarity !== 'N/A' && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
            {item.rarity}
          </span>
        )}
        {isAuthed && craftedQty > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90"
            title={`${craftedQty} crafted via My Blueprints`}
          >
            <Package className="w-3 h-3" />
            {craftedQty}
          </span>
        )}
        {isAuthed && savedBuildCount > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-sc-accent/30 bg-sc-accent/10 text-sc-accent"
            title={`${savedBuildCount} saved build${savedBuildCount !== 1 ? 's' : ''} in My Blueprints`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            {savedBuildCount}
          </span>
        )}
      </div>

      {/* Name + manufacturer */}
      <div className="flex-1">
        <p className="text-xs font-medium text-gray-200 leading-tight line-clamp-2">
          {humanizeRawDisplayName(item.name)}
        </p>
        {item.manufacturer_name && (
          <p className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">{item.manufacturer_name}</p>
        )}
      </div>

      {/* Category-specific stats */}
      <ItemCardStats item={item} category={eCat} />

      {/* Bottom row: sources + collection stepper */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <SourceIcons item={item} />
        {isAuthed && (
          <div onClick={(e) => e.stopPropagation()}>
            <CollectionStepper
              qty={collectionQty}
              onSetQty={(qty) => onSetCollectionQty(item.uuid, qty)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
