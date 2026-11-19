// The bundled station log has three unquoted columns: station, UTC timestamp, knots.
export function summariseWindLog(csv: string) {
  const counts = new Map<string, { valid: number; low: number }>();
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [station, , speed] = line.split(',');
    if (!station || !speed?.trim() || !Number.isFinite(Number(speed))) continue;
    const count = counts.get(station) ?? { valid: 0, low: 0 };
    count.valid++;
    if (Number(speed) < 5) count.low++;
    counts.set(station, count);
  }
  return [
    'Computed from the full CSV below. For a whole-period comparison at strictly below 5 knots, use these counts. Missing readings are excluded.',
    'station,below_5_knots,valid_readings,percent_below_5',
    ...Array.from(counts, ([station, { valid, low }]) =>
      `${station},${low},${valid},${(100 * low / valid).toFixed(2)}`),
  ].join('\n');
}
