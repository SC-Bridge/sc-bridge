// Pluggable seam: permissive until port data is populated (plan B), then enforces the port rule.
export function isCompatible(weapon, attachment) {
  const ports = weapon?.attachment_ports
  const attType = attachment?.attach_port_type
  const attSize = attachment?.attach_size
  // No port data on either side yet → allow (current state).
  if (!Array.isArray(ports) || ports.length === 0 || attType == null || attSize == null) return true
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
