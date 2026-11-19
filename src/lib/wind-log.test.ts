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
