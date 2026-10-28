// Shared by the owner browser journey and the offline future-clock regression.
// Keep this function self-contained so Playwright can run it in the browser's
// timezone: datetime-local fields must not be filled with UTC strings.
export function ownerAccessDates() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const localInput = (offset: number) => {
    const date = new Date(now + offset);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return {
    accessStarts: localInput(-day),
    accessExpires: localInput(2 * day),
    agentExpires: localInput(7 * day),
  };
}
