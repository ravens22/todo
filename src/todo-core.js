/**
 * TODO アプリのロジック（DOM に依存しない純粋関数）。
 *
 * - どの関数も引数の配列を書き換えず、新しい配列を返す。
 * - 何も変わらない場合は「元の配列そのもの」を返すので、呼び出し側は
 *   `next === todos` で変更の有無を判定できる。
 *
 * Todo の形: { id: string, title: string, completed: boolean, createdAt: number }
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TodoCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FILTERS = Object.freeze(['all', 'active', 'completed']);

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeTitle(title) {
    return String(title ?? '').trim();
  }

  function updateById(todos, id, update) {
    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) return todos;
    const current = todos[index];
    const next = update(current);
    if (next === current) return todos;
    const copy = todos.slice();
    copy[index] = next;
    return copy;
  }

  /** タイトルの前後の空白を除いて末尾に追加する。空なら何もしない。 */
  function addTodo(todos, title, options = {}) {
    const text = normalizeTitle(title);
    if (text === '') return todos;
    const todo = {
      id: options.id ?? createId(),
      title: text,
      completed: false,
      createdAt: options.now ?? Date.now(),
    };
    return [...todos, todo];
  }

  function toggleTodo(todos, id) {
    return updateById(todos, id, (todo) => ({ ...todo, completed: !todo.completed }));
  }

  /** タイトルを変更する。空にしようとした場合は変更しない（誤操作で消えないように）。 */
  function renameTodo(todos, id, title) {
    const text = normalizeTitle(title);
    if (text === '') return todos;
    return updateById(todos, id, (todo) => (todo.title === text ? todo : { ...todo, title: text }));
  }

  function removeTodo(todos, id) {
    const next = todos.filter((todo) => todo.id !== id);
    return next.length === todos.length ? todos : next;
  }

  function clearCompleted(todos) {
    const next = todos.filter((todo) => !todo.completed);
    return next.length === todos.length ? todos : next;
  }

  function setAllCompleted(todos, completed) {
    if (todos.every((todo) => todo.completed === completed)) return todos;
    return todos.map((todo) => (todo.completed === completed ? todo : { ...todo, completed }));
  }

  function filterTodos(todos, filter) {
    if (filter === 'active') return todos.filter((todo) => !todo.completed);
    if (filter === 'completed') return todos.filter((todo) => todo.completed);
    return todos;
  }

  function countActive(todos) {
    return todos.reduce((count, todo) => (todo.completed ? count : count + 1), 0);
  }

  /** URL のハッシュ（#/active など）から表示フィルターを決める。不明なら 'all'。 */
  function filterFromHash(hash) {
    const name = String(hash ?? '').replace(/^#\/?/, '');
    return FILTERS.includes(name) ? name : 'all';
  }

  /**
   * 保存データ（JSON 文字列）を読み込む。壊れたデータや不正な項目は捨て、
   * 読み込めない場合は空配列を返す。
   */
  function parseTodos(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return [];
    }
    if (!Array.isArray(data)) return [];

    const seen = new Set();
    const todos = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '';
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (id === '' || title === '' || seen.has(id)) continue;
      seen.add(id);
      todos.push({
        id,
        title,
        completed: item.completed === true,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
      });
    }
    return todos;
  }

  return {
    FILTERS,
    addTodo,
    toggleTodo,
    renameTodo,
    removeTodo,
    clearCompleted,
    setAllCompleted,
    filterTodos,
    countActive,
    filterFromHash,
    parseTodos,
  };
});
