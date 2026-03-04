import { ShoppingCart, Package, Swords, Skull, FileText } from 'lucide-react'

export default function SourceIcons({ item }) {
  return (
    <div className="flex items-center gap-1.5">
      {item.has_shops    ? <ShoppingCart className="w-3 h-3 text-gray-400" title="Shops" /> : null}
      {item.has_containers ? <Package className="w-3 h-3 text-gray-400" title="Containers" /> : null}
      {item.has_npcs     ? <Swords className="w-3 h-3 text-gray-400" title="NPCs" /> : null}
      {item.has_corpses  ? <Skull className="w-3 h-3 text-gray-400" title="Corpses" /> : null}
      {item.has_contracts ? <FileText className="w-3 h-3 text-gray-400" title="Contracts" /> : null}
    </div>
  )
}
