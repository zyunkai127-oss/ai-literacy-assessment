import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { summariseWindLog } from './wind-log';

it('counts low readings and valid denominators from the bundled CSV', () => {
  const summary = summariseWindLog(readFileSync('public/wind/station-log.csv', 'utf8'));
  for (const row of ['EGGD,9,167,5.39', 'EGLL,41,167,24.55', 'EGPH,72,166,43.37', 'EGCC,79,167,47.31']) {
    expect(summary).toContain(row);
  }
});

it('excludes missing values and treats exactly five knots as valid but not low', () => {
  expect(summariseWindLog('station,valid,sknt\nEGGD,time,\nEGGD,time,M\nEGGD,time,5\nEGGD,time,0')).toContain('EGGD,1,2,50.00');
});

it('summarises the field notebook and windmill test from the bundled pack', async () => {
  const { summariseField, summariseLab } = await import('./wind-log');
  const pack = (await import('./wind-pack.json')).default;
  const field = summariseField(pack.field);
  for (const row of ['Bristol,6,10,13,0', 'Manchester,3,6,13,1', 'Edinburgh,3,9,14,1', 'Heathrow,6,9,12,0']) expect(field).toContain(row);
  expect(field).toContain('Highest single reading: Edinburgh, 14 knots on 2024-10-02.');
  expect(summariseLab(pack.lab)).toContain('10.00 mph gave 2.236 V, lower than 2.386 V at 9.70 mph');
});
