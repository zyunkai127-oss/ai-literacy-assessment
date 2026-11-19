import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pack from './wind-pack.json';
import { windEvidence, windQuestion } from './secondary';
import { summariseWindLog } from './wind-log';

export async function scienceMaterials(windPack?: 2) {
  if (!windPack) return [windQuestion, ...windEvidence];

  const csv = await readFile(join(process.cwd(), 'public/wind/station-log.csv'), 'utf8');
  return [
    pack.context,
    'Distinguish a comparison threshold from a measured turbine cut-in speed. The windmill test reports voltage; it does not establish a cut-in speed or energy yield.',
    summariseWindLog(csv),
    'station-log.csv (original public station log, UTC, knots)',
    csv,
  ];
}
