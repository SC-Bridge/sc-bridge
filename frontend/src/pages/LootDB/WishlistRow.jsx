import { Plus, Bookmark } from 'lucide-react'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS } from '../../lib/lootDisplay'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'

export default function WishlistRow({ item, collectionQty, onSetCollectionQty, wishlistQty, onSetWishlistQty, onSelect }) {
  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[item.category] || item.category
  const rs = item.rarity ? rarityStyle(item.rarity) : null

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 border-b border-sc-border hover:bg-white/3 cursor-pointer transition-colors"
      onClick={() => onSelect(item.uuid)}
    >
      <span className={`text-[9px] font-display uppercase px-1.5 py-0.5 rounded shrink-0 w-20 text-center ${catStyle}`}>
        {catLabel}
      </span>
      <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
      {item.rarity && rs && (
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge} shrink-0`}>
          {item.rarity}
        </span>
      )}
      <SourceIcons item={item} />
      <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Wishlist qty stepper (want N) — decrement to 0 removes from wishlist */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-amber-500/60 font-mono mr-0.5">want</span>
          <button
            onClick={() => onSetWishlistQty(item.uuid, wishlistQty - 1)}
            className="w-5 h-5 rounded border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/10 transition-all text-xs leading-none"
            title={wishlistQty === 1 ? 'Remove from wishlist' : 'Decrease'}
          >−</button>
          <span className="text-[10px] font-mono text-amber-400 min-w-[14px] text-center">{wishlistQty}</span>
          <button
            onClick={() => onSetWishlistQty(item.uuid, wishlistQty + 1)}
            className="w-5 h-5 rounded border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/10 transition-all"
            title="Increase"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {/* Collection qty stepper (have N) */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-500 font-mono mr-0.5">have</span>
          <CollectionStepper qty={collectionQty} onSetQty={(qty) => onSetCollectionQty(item.uuid, qty)} />
        </div>
      </div>
    </div>
  )
}
