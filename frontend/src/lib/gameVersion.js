// "4.6.0-live.11319298" → "Alpha 4.6.0 LIVE"
// "4.7.0-ptu.12345678" → "Alpha 4.7.0 PTU"
export function formatVersionLabel(code) {
  if (!code) return '';
  const match = code.match(/^(\d+\.\d+\.\d+)-(\w+)\./);
  if (!match) return code;
  const [, version, channel] = match;
  return `Alpha ${version} ${channel.toUpperCase()}`;
}
