/** Shortens a long identifier while keeping both ends recognizable. */
export function shortenMiddle(value, head = 8, tail = 6) {
  const text = String(value);
  if (text.length <= head + tail + 3) {
    return text;
  }
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

/** Converts YYYYMMDD to YYYY-MM-DD and leaves other values unchanged. */
export function formatCompactDate(value) {
  const text = String(value);
  if (!/^\d{8}$/.test(text)) {
    return text;
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return "-";
  }
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(1)} s`;
}

export function formatCountdown(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
