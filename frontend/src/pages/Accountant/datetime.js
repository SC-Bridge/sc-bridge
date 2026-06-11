/**
 * Returns the current local datetime as a YYYY-MM-DDTHH:MM string suitable for
 * <input type="datetime-local">. The timezone-offset subtraction converts the UTC
 * internal representation to wall-clock local time before slicing — without it,
 * browsers in non-UTC zones would show a time shifted by their UTC offset.
 */
export function localDatetimeNow() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}
