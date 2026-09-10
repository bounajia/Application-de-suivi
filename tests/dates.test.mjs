import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { duration, elapsed, dayValue, daysLeft, today, isLate, DAY } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const fromToday = (days) => new Date(dayValue(today()) + days * DAY).toISOString().slice(0, 10);

test('calendar duration handles leap years, year changes and daylight-saving boundaries', () => {
  assert.equal(duration({ startDate: '2024-02-28', endDate: '2024-03-01' }), 2);
  assert.equal(duration({ startDate: '2025-02-28', endDate: '2025-03-01' }), 1);
  assert.equal(duration({ startDate: '2026-12-31', endDate: '2027-01-01' }), 1);
  assert.equal(duration({ startDate: '2026-03-28', endDate: '2026-03-30' }), 2);
  assert.equal(duration({ startDate: '2026-10-24', endDate: '2026-10-26' }), 2);
  assert.equal(duration({ startDate: '2026-09-09', endDate: '2026-09-09' }), 0);
});

test('elapsed calendar progress is bounded and separate from actual construction progress', () => {
  assert.equal(elapsed({ startDate: fromToday(1), endDate: fromToday(11), progress: 73 }), 0);
  assert.equal(elapsed({ startDate: fromToday(-11), endDate: fromToday(-1), progress: 20 }), 100);
  assert.equal(elapsed({ startDate: fromToday(-5), endDate: fromToday(5), progress: 10 }), 50);
  assert.equal(elapsed({ startDate: fromToday(-5), endDate: fromToday(5), progress: 95 }), 50);
  assert.equal(elapsed({ startDate: today(), endDate: today() }), 100);
  assert.equal(elapsed({ startDate: fromToday(1), endDate: fromToday(1) }), 0);
});

test('due today is not overdue and completed work is excluded from delay warnings', () => {
  assert.equal(daysLeft({ endDate: today() }), 0);
  assert.equal(daysLeft({ endDate: fromToday(2) }), 2);
  assert.equal(daysLeft({ endDate: fromToday(-2) }), -2);
  assert.equal(isLate({ endDate: today(), status: 'in_progress', progress: 50 }), false);
  assert.equal(isLate({ endDate: fromToday(-1), status: 'in_progress', progress: 50 }), true);
  assert.equal(isLate({ endDate: fromToday(-1), status: 'completed', progress: 100 }), false);
});
