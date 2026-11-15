/** ブラウザだけで動く最小限のテストランナー（依存ライブラリなし）。 */
(function () {
  'use strict';

  const tests = [];
  const afterHooks = [];

  class SkipError extends Error {}

  function format(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  const assert = {
    ok(value, message) {
      if (!value) throw new Error(message || `truthy を期待しましたが ${format(value)} でした`);
    },
    equal(actual, expected, message) {
      if (!Object.is(actual, expected)) {
        throw new Error(`${message ? message + ': ' : ''}期待値 ${format(expected)} / 実際 ${format(actual)}`);
      }
    },
    deepEqual(actual, expected, message) {
      const a = format(actual);
      const e = format(expected);
      if (a !== e) throw new Error(`${message ? message + ': ' : ''}期待値 ${e} / 実際 ${a}`);
    },
  };

  function test(name, fn) {
    tests.push({ name, fn });
  }

  function skip(reason) {
    throw new SkipError(reason);
  }

  function after(fn) {
    afterHooks.push(fn);
  }

  async function run() {
    const list = document.getElementById('results');
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const { name, fn } of tests) {
      const li = document.createElement('li');
      try {
        await fn();
        passed++;
        li.className = 'pass';
        li.textContent = `✓ ${name}`;
      } catch (error) {
        if (error instanceof SkipError) {
          skipped++;
          li.className = 'skip';
          li.textContent = `– ${name}（スキップ: ${error.message}）`;
        } else {
          failed++;
          li.className = 'fail';
          li.textContent = `✗ ${name}\n${(error && error.stack) || error}`;
          console.error(name, error);
        }
      }
      list.appendChild(li);
    }

    for (const hook of afterHooks) {
      try {
        await hook();
      } catch (error) {
        console.error('after hook', error);
      }
    }

    const summary = document.getElementById('summary');
    summary.textContent = `${passed} 件成功 / ${failed} 件失敗 / ${skipped} 件スキップ`;
    summary.className = failed ? 'fail' : 'pass';
    document.title = `${failed ? 'FAIL' : 'PASS'} - TODO テスト`;
    document.body.dataset.status = failed ? 'fail' : 'pass';
  }

  window.TestHarness = { test, assert, skip, after, run, SkipError };
})();
