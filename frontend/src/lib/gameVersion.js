// "4.6.0-live.11319298" → "Alpha 4.6.0 LIVE"
// "4.7.0-ptu.12345678"  → "Alpha 4.7.0 PTU"
// "1.0.0-techpreview.11286463" → "SC 1.0 TECH-PREVIEW"
export function formatVersionLabel(code, channel) {
  if (!code) return '';
  const match = code.match(/^(\d+\.\d+\.\d+)-([a-z-]+)\./);
  if (!match) return code;
  const [, version, codeChannel] = match;
  const ch = (channel || codeChannel).toUpperCase();
  const prefix = ch === 'TECH-PREVIEW' || ch === 'TECHPREVIEW' ? 'SC' : 'Alpha';
  const displayCh = ch === 'TECHPREVIEW' ? 'TECH-PREVIEW' : ch;
  return `${prefix} ${version} ${displayCh}`;
}

// "4.6.0-live.11319298" → "11319298"
export function extractBuildNumber(code) {
  if (!code) return '';
  const dot = code.lastIndexOf('.');
  return dot >= 0 ? code.slice(dot + 1) : '';
}

// Full display for dropdowns: "Alpha 4.6.0 LIVE · 11319298"
export function formatVersionFull(code, channel) {
  const label = formatVersionLabel(code, channel);
  const build = extractBuildNumber(code);
  return build ? `${label} · ${build}` : label;
}
