const { setTimeout: delay } = require('node:timers/promises');

// Chrome API의 비동기 결과가 실제로 참이 될 때까지 기다린다.
// waitForFunction에 async predicate를 넘기면 Promise 자체가 참으로 취급되어
// 첫 결과가 false여도 polling이 끝날 수 있으므로 Node에서 evaluate 결과를 기다린다.
async function waitForBrowserState(page, predicate, argument, { timeout = 15000, polling = 50 } = {}) {
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(polling) || polling <= 0) {
    throw new Error('Browser state timeout and polling interval must be positive finite numbers.');
  }
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeout} ms waiting for browser state.`)), timeout);
  });
  try {
    while (true) {
      // API 호출이 끝나지 않는 경우도 전체 제한 시간을 넘지 않도록 같은 deadline과 경합시킨다.
      const result = await Promise.race([page.evaluate(predicate, argument), deadline]);
      if (result) return result;
      await Promise.race([delay(polling), deadline]);
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { waitForBrowserState };
