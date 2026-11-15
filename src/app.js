/**
 * TODO アプリの画面処理。
 * ロジックは todo-core.js に置き、ここでは DOM の更新・イベント・保存だけを扱う。
 */
(function () {
  'use strict';

  const Core = window.TodoCore;
  const UNDO_TIMEOUT_MS = 6000;
  // ?ns=xxx を付けると保存先を分けられる（UI テストが実データを壊さないため）。
  const namespace = new URLSearchParams(location.search).get('ns');
  const STORAGE_KEY = 'todo-app:v1' + (namespace ? ':' + namespace : '');

  const ICONS = {
    edit:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    destroy:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  };
  // 再描画で項目が消えたとき、近くの項目のどのボタンへフォーカスを移すか
  const FOCUS_TARGETS = ['.toggle', '.edit', '.destroy'];

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('new-todo-form'),
    input: $('new-todo'),
    main: $('main'),
    toggleAll: $('toggle-all'),
    toggleAllLabel: $('toggle-all-label'),
    list: $('todo-list'),
    empty: $('empty'),
    filterEmpty: $('filter-empty'),
    footer: $('footer'),
    count: $('count'),
    filterLinks: document.querySelectorAll('.filters a'),
    clearCompleted: $('clear-completed'),
    storageWarning: $('storage-warning'),
    toast: $('toast'),
    toastMessage: $('toast-message'),
    toastUndo: $('toast-undo'),
  };

  // localStorage はプライベートモードや設定で使えないことがあるので必ず try/catch で包む
  const storage = {
    load() {
      try {
        return Core.parseTodos(localStorage.getItem(STORAGE_KEY));
      } catch {
        return [];
      }
    },
    save(todos) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
        return true;
      } catch {
        return false;
      }
    },
  };

  let todos = storage.load();
  let filter = Core.filterFromHash(location.hash);
  let undo = null; // { snapshot: Todo[], timer: number }

  // ---------------------------------------------------------------------------
  // 状態の更新
  // ---------------------------------------------------------------------------

  /** 状態を差し替えて保存・再描画する。undoMessage を渡すと「元に戻す」を表示する。 */
  function commit(next, undoMessage) {
    if (next === todos) return;
    const previous = todos;
    todos = next;
    els.storageWarning.hidden = storage.save(todos);
    render();
    if (undoMessage) showUndo(undoMessage, previous);
    else hideUndo();
  }

  // ---------------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------------

  function render() {
    const focus = rememberListFocus();
    const visible = Core.filterTodos(todos, filter);
    const activeCount = Core.countActive(todos);
    const completedCount = todos.length - activeCount;
    const hasTodos = todos.length > 0;

    renderList(visible);

    els.main.hidden = !hasTodos;
    els.footer.hidden = !hasTodos;
    els.empty.hidden = hasTodos;
    els.filterEmpty.hidden = !hasTodos || visible.length > 0;
    els.filterEmpty.textContent =
      filter === 'completed' ? '完了済みのタスクはありません。' : '未完了のタスクはありません。すべて完了です！';

    const allDone = hasTodos && activeCount === 0;
    els.toggleAll.checked = allDone;
    els.toggleAllLabel.textContent = allDone ? 'すべて未完了に戻す' : 'すべて完了にする';

    els.count.textContent = `残り ${activeCount} 件`;
    els.clearCompleted.hidden = completedCount === 0;
    els.clearCompleted.textContent = `完了済みを削除（${completedCount}）`;

    for (const link of els.filterLinks) {
      const selected = Core.filterFromHash(link.hash) === filter;
      link.classList.toggle('selected', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    restoreListFocus(focus);
  }

  /**
   * 一覧を差分更新する。既存の <li> は作り直さずに使い回すので、
   * チェックボックスや編集欄のフォーカス・入力中の内容が再描画で失われない。
   */
  function renderList(visible) {
    const visibleIds = new Set(visible.map((todo) => todo.id));
    const existing = new Map();
    for (const li of [...els.list.children]) {
      if (visibleIds.has(li.dataset.id)) existing.set(li.dataset.id, li);
      else li.remove();
    }
    visible.forEach((todo, index) => {
      const li = existing.get(todo.id) || createItem(todo.id);
      updateItem(li, todo);
      const current = els.list.children[index];
      if (current !== li) els.list.insertBefore(li, current || null);
    });
  }

  function createItem(id) {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.dataset.id = id;

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle';

    const title = document.createElement('span');
    title.className = 'title';

    li.append(toggle, title, iconButton('edit', '編集'), iconButton('destroy', '削除'));
    return li;
  }

  function iconButton(kind, tooltip) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button ' + kind;
    button.title = tooltip;
    button.innerHTML = ICONS[kind]; // 固定の SVG のみ。ユーザー入力は textContent で入れる
    return button;
  }

  function updateItem(li, todo) {
    li.classList.toggle('completed', todo.completed);
    const toggle = li.querySelector('.toggle');
    toggle.checked = todo.completed;
    toggle.setAttribute('aria-label', todo.title);
    const title = li.querySelector('.title');
    if (title.textContent !== todo.title) title.textContent = todo.title;
    li.querySelector('.edit').setAttribute('aria-label', `「${todo.title}」を編集`);
    li.querySelector('.destroy').setAttribute('aria-label', `「${todo.title}」を削除`);
  }

  // 削除などでフォーカスしていた項目が消えたとき、隣の項目へフォーカスを移す（キーボード操作のため）
  function rememberListFocus() {
    const el = document.activeElement;
    const li = el && el.closest ? el.closest('.todo-item') : null;
    if (!li || li.parentNode !== els.list) return null;
    return {
      index: Array.prototype.indexOf.call(els.list.children, li),
      selector: FOCUS_TARGETS.find((selector) => el.matches(selector)) || '.toggle',
    };
  }

  function restoreListFocus(saved) {
    if (!saved || els.list.contains(document.activeElement)) return;
    const items = els.list.children;
    if (items.length === 0) {
      els.input.focus();
      return;
    }
    items[Math.min(saved.index, items.length - 1)].querySelector(saved.selector).focus();
  }

  // ---------------------------------------------------------------------------
  // 編集
  // ---------------------------------------------------------------------------

  // 日本語入力の変換確定の Enter は「送信」として扱わない（Safari は keyCode 229 で判定）
  function isComposing(event) {
    return event.isComposing || event.keyCode === 229;
  }

  function startEdit(li) {
    const todo = todos.find((t) => t.id === li.dataset.id);
    if (!todo || li.classList.contains('editing')) return;

    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = todo.title;
    input.maxLength = 200;
    input.setAttribute('aria-label', 'タスクを編集（Enter で保存、Esc で取り消し）');
    li.classList.add('editing');
    li.append(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let done = false;
    function finish(save, refocus) {
      if (done) return; // remove() で blur が発生しても二重に処理しない
      done = true;
      li.classList.remove('editing');
      input.remove();
      if (save) commit(Core.renameTodo(todos, todo.id, input.value));
      if (refocus) li.querySelector('.edit').focus();
    }

    input.addEventListener('keydown', (event) => {
      if (isComposing(event)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false, true);
      }
    });
    input.addEventListener('blur', () => finish(true, false));
  }

  // ---------------------------------------------------------------------------
  // 「元に戻す」トースト
  // ---------------------------------------------------------------------------

  function shorten(text, max = 20) {
    const chars = Array.from(text); // 絵文字などを途中で切らないよう文字単位で数える
    return chars.length > max ? chars.slice(0, max).join('') + '…' : text;
  }

  function showUndo(message, snapshot) {
    if (undo) clearTimeout(undo.timer);
    undo = { snapshot, timer: setTimeout(hideUndo, UNDO_TIMEOUT_MS) };
    els.toastMessage.textContent = message;
    els.toast.hidden = false;
  }

  function hideUndo() {
    if (!undo) return;
    clearTimeout(undo.timer);
    undo = null;
    els.toast.hidden = true;
  }

  // マウスを乗せている間・フォーカス中は自動で消さない
  function pauseUndo() {
    if (undo) clearTimeout(undo.timer);
  }

  function resumeUndo() {
    if (!undo) return;
    clearTimeout(undo.timer);
    undo.timer = setTimeout(hideUndo, UNDO_TIMEOUT_MS);
  }

  // ---------------------------------------------------------------------------
  // イベント
  // ---------------------------------------------------------------------------

  const itemOf = (el) => el.closest('.todo-item');

  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && isComposing(event)) event.preventDefault();
  });

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = Core.addTodo(todos, els.input.value);
    els.input.value = '';
    if (next === todos) return;
    // 「完了済み」表示のまま追加すると新しいタスクが見えないので「すべて」に切り替える
    if (filter === 'completed') {
      filter = 'all';
      location.hash = '#/';
    }
    commit(next);
  });

  els.list.addEventListener('change', (event) => {
    if (!event.target.matches('.toggle')) return;
    commit(Core.toggleTodo(todos, itemOf(event.target).dataset.id));
  });

  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !els.list.contains(button)) return;
    const li = itemOf(button);
    if (button.matches('.edit')) {
      startEdit(li);
    } else if (button.matches('.destroy')) {
      const todo = todos.find((t) => t.id === li.dataset.id);
      if (todo) commit(Core.removeTodo(todos, todo.id), `「${shorten(todo.title)}」を削除しました`);
    }
  });

  els.list.addEventListener('dblclick', (event) => {
    if (event.target.matches('.title')) startEdit(itemOf(event.target));
  });

  els.toggleAll.addEventListener('change', () => {
    commit(Core.setAllCompleted(todos, els.toggleAll.checked));
  });

  els.clearCompleted.addEventListener('click', () => {
    const hadFocus = document.activeElement === els.clearCompleted;
    const count = todos.length - Core.countActive(todos);
    commit(Core.clearCompleted(todos), `完了済みのタスク ${count} 件を削除しました`);
    if (hadFocus) els.input.focus(); // ボタンが消えるのでフォーカスを入力欄へ
  });

  els.toastUndo.addEventListener('click', () => {
    if (!undo) return;
    const hadFocus = document.activeElement === els.toastUndo;
    commit(undo.snapshot);
    if (hadFocus) els.input.focus();
  });
  els.toast.addEventListener('mouseenter', pauseUndo);
  els.toast.addEventListener('focusin', pauseUndo);
  els.toast.addEventListener('mouseleave', resumeUndo);
  els.toast.addEventListener('focusout', resumeUndo);

  window.addEventListener('hashchange', () => {
    filter = Core.filterFromHash(location.hash);
    render();
  });

  // 別のタブで変更されたら取り込む
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    todos = storage.load();
    hideUndo();
    render();
  });

  render();
})();
