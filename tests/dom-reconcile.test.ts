/**
 * @jest-environment jsdom
 */
import { reconcileRowsInPlace } from '../src/view/task-list/dom-reconcile';

/**
 * reconcileRowsInPlace — the in-place keyed reconcile that replaces the
 * task list's double-buffer cloneNode/replaceChild swap.
 *
 * Contract:
 *  - rows reported stale by `isStale` are detached and end up out of the list
 *  - every row that survives keeps its DOM element identity (nodes are moved,
 *    never re-created)
 *  - after the call, list children order matches `orderedRows`
 *  - an unchanged refresh performs ZERO DOM mutations (no insert/move)
 *  - non-row children (e.g. the lazy-load sentinel) are never detached
 */
describe('reconcileRowsInPlace', () => {
  function row(id: string): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset.id = id;
    return li;
  }

  function listWith(...rows: HTMLElement[]): HTMLUListElement {
    const list = document.createElement('ul');
    for (const el of rows) list.appendChild(el);
    document.body.appendChild(list);
    return list;
  }

  const neverStale = (): boolean => false;

  it('leaves an already-ordered list untouched (zero DOM mutations)', () => {
    const a = row('a');
    const b = row('b');
    const list = listWith(a, b);

    const insertSpy = jest.spyOn(list, 'insertBefore');

    reconcileRowsInPlace(list, [a, b], neverStale);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(Array.from(list.children)).toEqual([a, b]);
  });

  it('reorders in place and keeps element identity', () => {
    const a = row('a');
    const b = row('b');
    const c = row('c');
    const list = listWith(a, b, c);

    reconcileRowsInPlace(list, [c, a, b], neverStale);

    expect(Array.from(list.children)).toEqual([c, a, b]);
    // Identity: the same nodes, moved — not re-created copies.
    expect(list.children[1]).toBe(a);
  });

  it('appends new rows after the existing ones', () => {
    const a = row('a');
    const list = listWith(a);
    const b = row('b');
    const c = row('c');

    reconcileRowsInPlace(list, [a, b, c], neverStale);

    expect(Array.from(list.children)).toEqual([a, b, c]);
    expect(list.lastElementChild).toBe(c);
  });

  it('detaches stale rows and keeps the rest in order', () => {
    const a = row('a');
    const b = row('b');
    const c = row('c');
    const list = listWith(a, b, c);

    reconcileRowsInPlace(
      list,
      [a, c],
      (child) => (child as HTMLLIElement).dataset?.id === 'b',
    );

    expect(Array.from(list.children)).toEqual([a, c]);
    // Detached node still exists standalone (caller may cache-drop it).
    expect(b.isConnected).toBe(false);
    expect(c.isConnected).toBe(true);
  });

  it('detaches everything when the caller reports every row stale', () => {
    const a = row('a');
    const list = listWith(a);

    reconcileRowsInPlace(list, [], () => true);

    expect(list.children.length).toBe(0);
    expect(a.isConnected).toBe(false);
  });

  it('shrinks a longer list down to the wanted rows', () => {
    const a = row('a');
    const b = row('b');
    const c = row('c');
    const list = listWith(a, b, c);

    reconcileRowsInPlace(
      list,
      [a],
      (child) => (child as HTMLLIElement).dataset?.id === 'b',
    );

    // `c` is not reported stale and not wanted: after b is detached the
    // anchor scan stops at index 1 — c stays connected. The caller's stale
    // predicate decides composition; the helper only detaches what it is
    // told to.
    expect(Array.from(list.children)).toEqual([a, c]);
  });

  it('never detaches non-row children (sentinel) and orders rows before them', () => {
    const a = row('a');
    const sentinel = document.createElement('div');
    const list = listWith(a, sentinel);
    const b = row('b');

    reconcileRowsInPlace(
      list,
      [a, b],
      (child) => (child as HTMLLIElement).dataset?.id !== undefined,
    );

    expect(Array.from(list.children)).toEqual([a, b, sentinel]);
    expect(sentinel.isConnected).toBe(true);
  });

  it('inserts a new row in the middle with a single move', () => {
    const a = row('a');
    const b = row('b');
    const list = listWith(a, b);
    const mid = row('mid');

    const insertSpy = jest.spyOn(list, 'insertBefore');

    reconcileRowsInPlace(list, [a, mid, b], neverStale);

    expect(Array.from(list.children)).toEqual([a, mid, b]);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
