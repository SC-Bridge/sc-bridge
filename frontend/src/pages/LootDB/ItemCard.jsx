import { Bookmark, BookmarkPlus, Check, Package, SlidersHorizontal } from 'lucide-react'
import { rarityStyle, CATEGORY_BADGE_STYLES, CATEGORY_LABELS, effectiveCategory, humanizeRawDisplayName } from '../../lib/lootDisplay'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'
import MadeStepper from './MadeStepper'
import ItemCardStats from './ItemCardStats'

function fmtStat(n) {
  if (n == null) return ''
  return n >= 1000 ? Math.round(n).toLocaleString() : (n % 1 === 0 ? n : n.toFixed(1))
}

export default function ItemCard({ item, collectionQty, craftedQty = 0, savedBuildCount = 0, onSetCollectionQty, onSetBuildQty = () => {}, wishlisted, onToggleWishlist, isAuthed, onSelect }) {
  const rs = rarityStyle(item.rarity)
  const eCat = effectiveCategory(item)
  const catStyle = CATEGORY_BADGE_STYLES[eCat] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[eCat] || eCat
  const isCollected = collectionQty > 0
  const build = item._build || null // synthetic saved-build item (#90)

  return (
    <div
      className="panel p-3 flex flex-col gap-1.5 cursor-pointer hover:border-sc-border/80 transition-all duration-150 relative"
      onClick={() => onSelect(item.uuid)}
    >
      {/* Collected indicator (not for build cards) */}
      {isCollected && !build && (
        <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-emerald-500/80 flex items-center justify-center z-10">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      {/* Top row: category badge + wishlist + rarity */}
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
          {catLabel}
        </span>
        {build && (
          <span className="flex items-center gap-1 text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded border border-sc-accent/30 bg-sc-accent/10 text-sc-accent">
            <SlidersHorizontal className="w-3 h-3" /> Build
          </span>
        )}
        <div className="flex-1" />
        {isAuthed && !build && (
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
        {isAuthed && !build && craftedQty > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90"
            title={`${craftedQty} crafted via My Blueprints`}
          >
            <Package className="w-3 h-3" />
            {craftedQty}
          </span>
        )}
        {isAuthed && !build && savedBuildCount > 0 && (
          <span
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-sc-accent/30 bg-sc-accent/10 text-sc-accent"
            title={`${savedBuildCount} saved build${savedBuildCount !== 1 ? 's' : ''} in My Blueprints`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            {savedBuildCount}
          </span>
        )}
      </div>

      {/* Name. Build cards: build name + the base item as subtitle. */}
      <div className="flex-1">
        <p className="text-xs font-medium text-gray-200 leading-tight line-clamp-2">
          {build ? item.name : humanizeRawDisplayName(item.name)}
        </p>
        {build ? (
          <p className="text-[10px] font-mono text-sc-accent/70 mt-0.5 truncate">{build.baseName}</p>
        ) : item.manufacturer_name ? (
          <p className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">{item.manufacturer_name}</p>
        ) : null}
      </div>

      {/* Category-specific stats (tuned values on a build card) */}
      <ItemCardStats item={item} category={eCat} />

      {/* Build: show the headline base→tuned lift */}
      {build && item._lift && (
        <div className="text-[10px] font-mono text-gray-400">
          {item._lift.label}: <span className="text-gray-500">{fmtStat(item._lift.base)}</span>
          <span className="text-sc-accent"> → {fmtStat(item._lift.tuned)}</span>
        </div>
      )}

      {/* Bottom row: looted items get sources + Collected stepper. Build cards
          get a "Made N" stepper — you can't collect a site-only build, but you
          can craft N of it in-game (#90). */}
      {!build ? (
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
      ) : isAuthed && (
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wide text-gray-500">Made</span>
          <div onClick={(e) => e.stopPropagation()}>
            <MadeStepper
              qty={build.crafted}
              onSetQty={(qty) => onSetBuildQty(build.id, qty)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
