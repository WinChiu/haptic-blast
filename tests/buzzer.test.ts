/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuzzer } from '../util/buzzer';

function setup() {
  const log: string[] = [];
  const realtime = {
    set: (a: number, f: number) => log.push(`set ${a.toFixed(2)} ${f}`),
    stop: () => log.push('stop'),
  };
  const buzzer = createBuzzer({
    getRealtime: () => realtime,
    androidVibration: null,
    frequency: () => 1,
    androidHoldMs: 60000,
  });
  return { log, buzzer };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a pulse buzzes at the given strength and stops once, after its length', async () => {
  const { log, buzzer } = setup();
  buzzer.pulse(0.6, 60);
  assert.deepEqual(log, ['set 0.60 1']);
  await wait(30);
  assert.deepEqual(log, ['set 0.60 1']); // nothing stopped it early
  await wait(60);
  assert.deepEqual(log, ['set 0.60 1', 'stop']);
});

test('changing the strength during a pulse keeps it running and does not stop it', async () => {
  const { log, buzzer } = setup();
  buzzer.pulse(0.9, 80);
  await wait(20);
  buzzer.level(0.7);
  await wait(20);
  buzzer.level(0.5);
  assert.deepEqual(log, ['set 0.90 1', 'set 0.70 1', 'set 0.50 1']);
  await wait(80);
  assert.equal(log.filter((l) => l === 'stop').length, 1);
});

test('level does nothing when nothing is buzzing', () => {
  const { log, buzzer } = setup();
  buzzer.level(0.5);
  assert.deepEqual(log, []);
});

test('the controller is a plain object created once: no render can recreate or stop it', () => {
  // The same object is used for the whole life of the screen; calling its
  // methods any number of times in between must not stop a running pulse.
  const { log, buzzer } = setup();
  const methods = { ...buzzer };
  buzzer.pulse(0.5, 100);
  for (let i = 0; i < 20; i++) methods.level(0.5);
  assert.equal(log.includes('stop'), false);
});

test('stop silences a running pulse and cancels its timer', async () => {
  const { log, buzzer } = setup();
  buzzer.pulse(0.5, 50);
  buzzer.stop();
  await wait(80);
  assert.deepEqual(log, ['set 0.50 1', 'stop']);
});
