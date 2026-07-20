// Real weapon attachment port types (from the game data) → the loadout's
// 3-slot attachment model (design: optic / barrel / underbarrel).
// Magazine / Utility / Missile ports exist in the data but aren't part of the
// 3-slot model yet, so they map to nothing and are excluded from the bench.
export const PORT_TYPE_TO_SLOT = {
  IronSight: 'optic',
  Barrel: 'barrel',
  BottomAttachment: 'underbarrel',
}

// Display order + labels for the three bench attachment slots.
export const SLOT_ORDER = ['optic', 'barrel', 'underbarrel']
export const SLOT_LABEL = { optic: 'Optic', barrel: 'Barrel', underbarrel: 'Underbarrel' }

// Weapon attachment ports live at base_stats.attachment_ports (the crafting
// blueprint shape); older/hand-built shapes may put them at the top level.
export function weaponPorts(weapon) {
  const ports = weapon?.attachment_ports ?? weapon?.base_stats?.attachment_ports
  return Array.isArray(ports) ? ports : []
}

// The loadout slot an attachment belongs to, from its port type (real data
// uses attach_port_type; fall back to sub_type). null → not one of the three
// modelled slots (e.g. a magazine), so it's excluded from the bench.
export function attachmentSlot(attachment) {
  return PORT_TYPE_TO_SLOT[attachment?.attach_port_type ?? attachment?.sub_type] ?? null
}

// The attachment slots a specific weapon actually exposes. Derived from the
// weapon's ports when present; otherwise falls back to whatever slots the
// supplied attachments declare (keeps behaviour sane before port data loads,
// and lets unit tests drive slots via the attachment list).
export function weaponAttachmentSlots(weapon, attachments = []) {
  const set = new Set()
  const ports = weaponPorts(weapon)
  if (ports.length) {
    for (const p of ports) {
      const slot = PORT_TYPE_TO_SLOT[p.port_type]
      if (slot) set.add(slot)
    }
  } else {
    for (const a of attachments) if (a?.slot) set.add(a.slot)
  }
  return SLOT_ORDER.filter((s) => set.has(s))
}

// Pluggable seam: permissive until port data is populated, then enforces the port rule.
export function isCompatible(weapon, attachment) {
  const ports = weaponPorts(weapon)
  const attType = attachment?.attach_port_type
  const attSize = attachment?.attach_size
  // No port data on either side yet → allow (current state).
  if (ports.length === 0 || attType == null || attSize == null) return true
  const attTags = new Set(String(attachment?.attach_tags || '').split(/\s+/).filter(Boolean))
  // Every token of the port's required tags must be present on the attachment.
  const tagsSatisfied = (required) =>
    String(required || '').split(/\s+/).filter(Boolean).every((t) => attTags.has(t))
  return ports.some(
    (p) =>
      p.port_type === attType &&
      attSize >= (p.size_min ?? 0) &&
      attSize <= (p.size_max ?? Infinity) &&
      tagsSatisfied(p.required_port_tags),
  )
}
