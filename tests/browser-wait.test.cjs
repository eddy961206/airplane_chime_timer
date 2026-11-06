const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { waitForBrowserState } = require('../scripts/wait-for-browser-state.cjs');

// 실 브라우저 없이도 async false를 성공으로 오인하는 동기화 회귀를 검증한다.
test('browser state polling awaits asynchronous false and repeats until the resolved value is true', async () => {
  let evaluations = 0;
  const page = { evaluate: (predicate, argument) => predicate(argument) };
  const result = await waitForBrowserState(page, async target => {
    await delay(1);
    return ++evaluations >= target;
  }, 3, { timeout: 1000, polling: 1 });
  assert.equal(result, true);
  assert.equal(evaluations, 3);
});

test('pending accelerated daily alarm cannot satisfy the rearmed schedule condition', async () => {
  const initialTime = Date.now();
  const expectedTime = initialTime + 10 * 60000;
  let evaluations = 0;
  const snapshots = [
    { count: 3, active: true, scheduledTime: initialTime + 1000 },
    { count: 3, active: true, scheduledTime: expectedTime },
    { count: 4, active: true, scheduledTime: expectedTime }
  ];
  const page = { evaluate: async (predicate, argument) => {
    await delay(1);
    return predicate({ ...argument, actual: snapshots[evaluations++] });
  } };
  await waitForBrowserState(page, ({ actual, before, expectedTime }) => actual.active
    && actual.count > before && actual.scheduledTime === expectedTime,
  { before: 3, expectedTime }, { timeout: 1000, polling: 1 });
  assert.equal(evaluations, 3);
});

test('browser state polling times out when resolved conditions remain false', async () => {
  let evaluations = 0;
  await assert.rejects(waitForBrowserState({ evaluate: async () => { evaluations++; return false; } },
    () => false, undefined, { timeout: 20, polling: 1 }), /Timed out after 20 ms/);
  assert.ok(evaluations >= 1);
});

test('browser state polling also bounds a hanging evaluate call', async () => {
  await assert.rejects(waitForBrowserState({ evaluate: () => new Promise(() => {}) },
    () => false, undefined, { timeout: 20, polling: 1 }), /Timed out after 20 ms/);
});

test('browser evaluation failures are reported rather than retried as false conditions', async () => {
  let evaluations = 0;
  await assert.rejects(waitForBrowserState({ evaluate: async () => {
    evaluations++;
    throw new Error('The browser context closed');
  } }, () => false), /The browser context closed/);
  assert.equal(evaluations, 1);
});
