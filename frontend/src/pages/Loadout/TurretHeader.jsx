import React from 'react'
import WeaponBlock from './WeaponBlock'
import LockedPort from './LockedPort'

/**
 * TurretHeader — renders a turret housing as a section header with its weapon children.
 * Locked children (editable=0, e.g. door guns) render via LockedPort, not WeaponBlock.
 */
export default function TurretHeader({ item, children, overrides = {}, onOpenPicker, onAddToCart, renderGadgets }) {
  const turretLabel = item.mount_name || item.port_name?.replace('hardpoint_', '').replace(/_/g, ' ')
  const posHint = item.mount_name ? item.port_name?.replace('hardpoint_turret_', '').replace(/_/g, ' ') : null

  const override = overrides[item.port_id]
  const isOverridden = !!override

  return (
    <div>
      <div className="px-3 py-1 text-[12px] text-gray-600 bg-white/[0.01] font-medium uppercase tracking-wider border-t border-white/[0.04] first:border-t-0">
        {turretLabel}{posHint ? ` · ${posHint}` : ''}
        {item.weapon_count > 0 && <span className="text-gray-700 ml-1">({item.weapon_count}× weapons)</span>}
      </div>
      {children.length > 0 ? children.map(child => {
        // Truly locked: editable=0 AND no mount hierarchy (e.g. door guns where mount===child)
        const isLocked = (child.editable === 0 || child.editable === false) &&
          (!child.mount_name || child.mount_name === child.child_name)
        if (isLocked) {
          return <LockedPort key={child.port_id} item={child} />
        }
        const childOverride = overrides[child.port_id]
        const effChild = childOverride ? { ...child, ...childOverride } : child
        return (
          <React.Fragment key={child.port_id}>
            <WeaponBlock
              item={effChild}
              isCustomized={!!childOverride}
              weaponGroups={[]}
              onClickMount={() => onOpenPicker(child.port_id, child.port_type)}
              onClickWeapon={() => onOpenPicker(child.port_id, child.port_type)}
              onAddToCart={() => onAddToCart?.(child)}
            />
            {renderGadgets?.(effChild)}
          </React.Fragment>
        )
      }) : (
        (item.editable === 0 || item.editable === false) ? (
          <LockedPort key={`${item.port_id}-locked`} item={item} />
        ) : (
          <React.Fragment key={`${item.port_id}-weapon`}>
            <WeaponBlock
              item={override ? { ...item, ...override } : item}
              isCustomized={isOverridden}
              weaponGroups={[]}
              onClickMount={() => onOpenPicker(item.port_id, item.port_type)}
              onClickWeapon={() => onOpenPicker(item.port_id, item.port_type)}
              onAddToCart={() => onAddToCart?.(item)}
            />
            {renderGadgets?.(override ? { ...item, ...override } : item)}
          </React.Fragment>
        )
      )}
    </div>
  )
}
