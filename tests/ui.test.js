/**
 * 実際の画面（index.html）を iframe で開いて操作する UI テスト。
 * iframe の中身を操作するため、ローカルサーバー経由で開いたときだけ実行される。
 * 保存先は ?ns=uitest で分けているので、普段使っているデータには影響しない。
 */
(function () {
  'use strict';

  const { test, assert, skip, after } = TestHarness;
  const NS = 'uitest';
  const KEY = `todo-app:v1:${NS}`;
  let frame = null;

  function waitFor(predicate, message, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        let ok = false;
        try {
          ok = predicate();
        } catch {
          ok = false;
        }
        if (ok) return resolve();
        if (Date.now() - start > timeout) return reject(new Error(`タイムアウト: ${message}`));
        setTimeout(check, 10);
      })();
    });
  }

  async function openApp({ reset = true, hash = '' } = {}) {
    if (reset) localStorage.removeItem(KEY);
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.title = 'テスト対象のアプリ';
    frame.className = 'app-frame';
    await new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.src = `../index.html?ns=${NS}${hash}`;
      document.body.append(frame);
    });
    if (!frame.contentDocument) {
      skip('file:// で開いているため省略。ローカルサーバー経由で開くと実行されます');
    }
    return makeApi(frame.contentWindow, frame.contentDocument);
  }

  function makeApi(win, doc) {
    const api = {
      win,
      doc,
      q: (selector) => doc.querySelector(selector),
      shown: (id) => !doc.getElementById(id).hidden,
      add(text) {
        doc.getElementById('new-todo').value = text;
        doc.getElementById('new-todo-form').requestSubmit();
      },
      items: () => [...doc.querySelectorAll('#todo-list .todo-item')],
      titles: () => api.items().map((li) => li.querySelector('.title').textContent),
      item(title) {
        const li = api.items().find((el) => el.querySelector('.title').textContent === title);
        if (!li) throw new Error(`「${title}」が一覧にありません`);
        return li;
      },
      count: () => doc.getElementById('count').textContent,
      saved: () => JSON.parse(localStorage.getItem(KEY) || '[]'),
      press(target, key) {
        target.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      },
      async go(hash) {
        win.location.hash = hash;
        await waitFor(() => doc.querySelector('.filters a.selected').getAttribute('href') === hash, hash);
      },
    };
    return api;
  }

  test('UI: タスクを追加すると一覧・件数・保存データに反映される', async () => {
    const app = await openApp();
    assert.ok(app.shown('empty'), '最初は空の案内を表示');
    assert.ok(!app.shown('footer'), '最初はフッターを隠す');

    app.add('牛乳を買う');
    app.add('  散歩  ');
    app.add('   ');

    assert.deepEqual(app.titles(), ['牛乳を買う', '散歩']);
    assert.equal(app.count(), '残り 2 件');
    assert.equal(app.q('#new-todo').value, '', '入力欄は空になる');
    assert.ok(!app.shown('empty'));
    assert.deepEqual(app.saved().map((t) => t.title), ['牛乳を買う', '散歩']);
  });

  test('UI: 完了の切り替えとフィルター', async () => {
    const app = await openApp();
    app.add('A');
    app.add('B');

    app.item('A').querySelector('.toggle').click();
    assert.ok(app.item('A').classList.contains('completed'));
    assert.equal(app.count(), '残り 1 件');
    assert.equal(app.saved()[0].completed, true);

    await app.go('#/active');
    assert.deepEqual(app.titles(), ['B']);
    await app.go('#/completed');
    assert.deepEqual(app.titles(), ['A']);
    await app.go('#/');
    assert.deepEqual(app.titles(), ['A', 'B']);
  });

  test('UI: 編集（Enter で保存 / Esc で取り消し / 空なら元のまま）', async () => {
    const app = await openApp();
    app.add('A');

    app.item('A').querySelector('.title').dispatchEvent(new app.win.MouseEvent('dblclick', { bubbles: true }));
    let input = app.q('.edit-input');
    assert.ok(input, 'ダブルクリックで編集欄が出る');
    input.value = '  A2 ';
    app.press(input, 'Enter');
    assert.equal(app.q('.edit-input'), null, '編集欄が閉じる');
    assert.deepEqual(app.titles(), ['A2']);
    assert.equal(app.saved()[0].title, 'A2');

    app.item('A2').querySelector('.edit').click();
    input = app.q('.edit-input');
    input.value = '保存しない';
    app.press(input, 'Escape');
    assert.deepEqual(app.titles(), ['A2'], 'Esc は取り消し');

    app.item('A2').querySelector('.edit').click();
    input = app.q('.edit-input');
    input.value = '   ';
    app.press(input, 'Enter');
    assert.deepEqual(app.titles(), ['A2'], '空にしても消えない');
  });

  test('UI: 削除と「元に戻す」', async () => {
    const app = await openApp();
    app.add('A');
    app.add('B');
    app.add('C');

    app.item('B').querySelector('.destroy').click();
    assert.deepEqual(app.titles(), ['A', 'C']);
    assert.ok(app.shown('toast'), 'トーストを表示');
    assert.ok(app.q('#toast-message').textContent.includes('B'));

    app.q('#toast-undo').click();
    assert.deepEqual(app.titles(), ['A', 'B', 'C'], '元の位置に戻る');
    assert.ok(!app.shown('toast'));
    assert.equal(app.saved().length, 3);
  });

  test('UI: 別の操作をすると「元に戻す」は消える', async () => {
    const app = await openApp();
    app.add('A');
    app.add('B');
    app.item('A').querySelector('.destroy').click();
    assert.ok(app.shown('toast'));
    app.add('C');
    assert.ok(!app.shown('toast'));
  });

  test('UI: すべて完了と、完了済みの一括削除', async () => {
    const app = await openApp();
    app.add('A');
    app.add('B');

    app.q('#toggle-all').click();
    assert.equal(app.count(), '残り 0 件');
    assert.equal(app.q('#toggle-all-label').textContent, 'すべて未完了に戻す');
    assert.ok(app.shown('clear-completed'));

    app.q('#clear-completed').click();
    assert.deepEqual(app.titles(), []);
    assert.ok(app.shown('empty'));
    assert.ok(!app.shown('footer'));
  });

  test('UI: 再読み込みしても内容が残る', async () => {
    let app = await openApp();
    app.add('A');
    app.add('B');
    app.item('B').querySelector('.toggle').click();

    app = await openApp({ reset: false });
    assert.deepEqual(app.titles(), ['A', 'B']);
    assert.ok(app.item('B').classList.contains('completed'));
  });

  test('UI: HTML はタグとして解釈せず文字のまま表示する', async () => {
    const app = await openApp();
    const text = '<img src=x onerror="parent.__xss = true">';
    app.add(text);
    assert.deepEqual(app.titles(), [text]);
    assert.equal(app.q('#todo-list img'), null);
    assert.ok(!window.__xss);
  });

  test('UI: 「完了済み」表示で追加すると「すべて」に切り替わる', async () => {
    const app = await openApp({ hash: '#/completed' });
    app.add('A');
    assert.deepEqual(app.titles(), ['A']);
    await waitFor(() => app.win.location.hash === '#/', 'ハッシュが #/ になる');
  });

  after(() => {
    localStorage.removeItem(KEY);
    if (frame) frame.remove();
  });
})();
