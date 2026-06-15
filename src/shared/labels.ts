// Human label for a daily trip, derived from its origin departure time.

export function tripLabel(departureTime: string, vehicleCode: string): string {
  const hour = Number.parseInt(departureTime.split(':')[0] ?? '', 10);
  const period = Number.isNaN(hour)
    ? 'Trip'
    : hour < 12
      ? 'Morning'
      : hour < 16
        ? 'Afternoon'
        : 'Evening';
  if (!departureTime) return vehicleCode || 'Trip';
  return `${period} · ${departureTime}${vehicleCode ? ` · ${vehicleCode}` : ''}`;
}
