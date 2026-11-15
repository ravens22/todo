/** todo-core.js（ロジック）の単体テスト */
(function () {
  'use strict';

  const { test, assert } = TestHarness;
  const C = TodoCore;

  const sample = () => [
    { id: 'a', title: '牛乳を買う', completed: false, createdAt: 1 },
    { id: 'b', title: 'メールを返信', completed: true, createdAt: 2 },
    { id: 'c', title: '散歩', completed: false, createdAt: 3 },
  ];

  test('addTodo: 前後の空白を除いて末尾に追加し、元の配列は変更しない', () => {
    const todos = sample();
    const next = C.addTodo(todos, '  本を読む  ', { id: 'd', now: 10 });
    assert.equal(next.length, 4);
    assert.deepEqual(next[3], { id: 'd', title: '本を読む', completed: false, createdAt: 10 });
    assert.equal(todos.length, 3, '元の配列');
  });

  test('addTodo: 空・空白だけ（全角スペース含む）は追加せず同じ配列を返す', () => {
    const todos = sample();
    assert.equal(C.addTodo(todos, ''), todos);
    assert.equal(C.addTodo(todos, ' 　\n\t'), todos);
    assert.equal(C.addTodo(todos, null), todos);
  });

  test('addTodo: ID を自動で一意に振る', () => {
    const next = C.addTodo(C.addTodo([], 'A'), 'B');
    assert.ok(typeof next[0].id === 'string' && next[0].id !== '');
    assert.ok(next[0].id !== next[1].id);
  });

  test('toggleTodo: 指定した項目だけ完了状態を反転する', () => {
    const todos = sample();
    const next = C.toggleTodo(todos, 'b');
    assert.equal(next[1].completed, false);
    assert.equal(next[0], todos[0], '他の項目はそのまま');
    assert.equal(todos[1].completed, true, '元の項目は変更しない');
    assert.equal(C.toggleTodo(todos, 'zzz'), todos, '存在しない ID');
  });

  test('renameTodo: 空白を除いて変更。空・同じ名前・存在しない ID は変更なし', () => {
    const todos = sample();
    assert.equal(C.renameTodo(todos, 'a', ' 豆乳を買う ')[0].title, '豆乳を買う');
    assert.equal(C.renameTodo(todos, 'a', '   '), todos);
    assert.equal(C.renameTodo(todos, 'a', '牛乳を買う'), todos);
    assert.equal(C.renameTodo(todos, 'zzz', 'X'), todos);
  });

  test('removeTodo: 指定した項目を削除する', () => {
    const todos = sample();
    assert.deepEqual(C.removeTodo(todos, 'b').map((t) => t.id), ['a', 'c']);
    assert.equal(C.removeTodo(todos, 'zzz'), todos);
  });

  test('clearCompleted: 完了済みだけを削除する', () => {
    const todos = sample();
    assert.deepEqual(C.clearCompleted(todos).map((t) => t.id), ['a', 'c']);
    const none = C.clearCompleted(todos);
    assert.equal(C.clearCompleted(none), none, '完了済みがなければ同じ配列');
  });

  test('setAllCompleted: すべて完了／すべて未完了にする', () => {
    const todos = sample();
    assert.ok(C.setAllCompleted(todos, true).every((t) => t.completed));
    assert.ok(C.setAllCompleted(todos, false).every((t) => !t.completed));
    const allDone = C.setAllCompleted(todos, true);
    assert.equal(C.setAllCompleted(allDone, true), allDone, '変化がなければ同じ配列');
  });

  test('filterTodos / countActive', () => {
    const todos = sample();
    assert.deepEqual(C.filterTodos(todos, 'all').map((t) => t.id), ['a', 'b', 'c']);
    assert.deepEqual(C.filterTodos(todos, 'active').map((t) => t.id), ['a', 'c']);
    assert.deepEqual(C.filterTodos(todos, 'completed').map((t) => t.id), ['b']);
    assert.deepEqual(C.filterTodos(todos, 'unknown').map((t) => t.id), ['a', 'b', 'c']);
    assert.equal(C.countActive(todos), 2);
    assert.equal(C.countActive([]), 0);
  });

  test('filterFromHash: URL のハッシュから表示フィルターを決める', () => {
    assert.equal(C.filterFromHash(''), 'all');
    assert.equal(C.filterFromHash('#/'), 'all');
    assert.equal(C.filterFromHash('#/active'), 'active');
    assert.equal(C.filterFromHash('#/completed'), 'completed');
    assert.equal(C.filterFromHash('#completed'), 'completed');
    assert.equal(C.filterFromHash('#/bogus'), 'all');
    assert.equal(C.filterFromHash(undefined), 'all');
  });

  test('parseTodos: 壊れたデータでも落ちずに空配列を返す', () => {
    assert.deepEqual(C.parseTodos(null), []);
    assert.deepEqual(C.parseTodos(''), []);
    assert.deepEqual(C.parseTodos('{not json'), []);
    assert.deepEqual(C.parseTodos('{"a":1}'), []);
  });

  test('parseTodos: 不正な項目・重複 ID を捨て、型を整える', () => {
    const json = JSON.stringify([
      { id: 'a', title: ' A ', completed: true, createdAt: 5 },
      { id: 'a', title: '重複' },
      { id: 7, title: 'B', completed: 'yes' },
      { id: 'x', title: '   ' },
      { title: 'ID なし' },
      null,
      'text',
    ]);
    assert.deepEqual(C.parseTodos(json), [
      { id: 'a', title: 'A', completed: true, createdAt: 5 },
      { id: '7', title: 'B', completed: false, createdAt: 0 },
    ]);
  });
})();
