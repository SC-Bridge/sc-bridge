import { Bookmark, BookmarkPlus } from 'lucide-react'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS } from '../../lib/lootDisplay'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'

export default function ItemCard({ item, collectionQty, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onSelect }) {
  const rs = rarityStyle(item.rarity)
  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[item.category] || item.category

  return (
    <div
      className={`panel p-3 flex flex-col gap-2 cursor-pointer hover:border-sc-border/80 transition-all duration-150 ${collectionQty > 0 ? 'opacity-75' : ''}`}
      onClick={() => onSelect(item.uuid)}
    >
      {/* Top row: category badge + wishlist icon + rarity badge */}
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
          {catLabel}
        </span>
        <div className="flex-1" />
        {isAuthed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWishlist(item.uuid, wishlisted) }}
            className={`flex items-center justify-center transition-all duration-150 shrink-0 ${
              wishlisted ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            {wishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          </button>
        )}
        {item.rarity && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
            {item.rarity}
          </span>
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-gray-200 leading-tight line-clamp-2 flex-1">
        {item.name}
      </p>

      {/* Bottom row: sources + collection stepper */}
      <div className="flex items-center justify-between">
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
