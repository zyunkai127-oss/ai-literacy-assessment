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

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Field notebook: a header row of regions, then one row per day of readings in knots.
export function summariseField(field: string[][]) {
  const [header, ...days] = field;
  const regions = header.slice(1);
  let top = { region: '', day: '', speed: -Infinity };
  const rows = regions.map((region, i) => {
    const values = days.map(day => Number(day[i + 1]));
    days.forEach((day, d) => { if (values[d] > top.speed) top = { region, day: day[0], speed: values[d] }; });
    return `${region},${Math.min(...values)},${median(values)},${Math.max(...values)},${values.filter(v => v < 5).length}`;
  });
  return [
    `Field notebook at 12:50 UTC, ${days.length} days (knots).`,
    'region,lowest,median,highest,days_below_5',
    ...rows,
    `Highest single reading: ${top.region}, ${top.speed} knots on ${top.day}.`,
  ].join('\n');
}

// Windmill test: a header row, then reading number, wind speed (mph) and output voltage.
export function summariseLab(lab: string[][]) {
  const rows = lab.slice(1).map(([, mph, volts]) => ({ mph: Number(mph), volts: Number(volts) })).sort((a, b) => a.mph - b.mph);
  const dips = rows.slice(1).flatMap((row, i) => row.volts < rows[i].volts
    ? [`${row.mph.toFixed(2)} mph gave ${row.volts} V, lower than ${rows[i].volts} V at ${rows[i].mph.toFixed(2)} mph`] : []);
  return [
    `Windmill test, ${rows.length} readings sorted by wind speed: ${rows.map(r => `${r.mph.toFixed(2)} mph → ${r.volts} V`).join('; ')}.`,
    dips.length ? `Output broadly rises with wind speed but not strictly: ${dips.join('; ')}.` : 'Output rises with wind speed in every reading.',
    'The test reports voltage only; it does not give a cut-in speed, power or energy yield.',
  ].join('\n');
}
