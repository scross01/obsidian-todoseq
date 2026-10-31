/**
 * In-place keyed row reconciliation for the Task List.
 *
 * This replaces the double-buffer strategy (build a DocumentFragment →
 * `cloneNode(false)` the list → `replaceChild`), which re-parented every
 * row on every refresh: even an refresh where nothing changed forced the
 * browser to lay out the entire list again, and moving a whole re-parented
 * subtree is why view-mode switches stay expensive on large lists.
 *
 * The reconcile instead:
 *   1. detaches rows the caller reports stale (static snapshot — indices
 *      shift while detaching otherwise), never touching non-row children
 *      such as the lazy-load sentinel, and then
 *   2. anchor-scans `orderedRows` against the live children: whenever the
 *      child at index i is not the wanted row, one `insertBefore` moves it
 *      into place. Already-positioned rows are O(1) checks, so an unchanged
 *      refresh performs zero DOM mutations and rows keep their DOM identity
 *      (their event listeners and layout survive refreshes).
 */
export function reconcileRowsInPlace(
  list: HTMLElement,
  orderedRows: HTMLElement[],
  isStale: (element: Element) => boolean,
): void {
  // Detach stale rows from a snapshot first: removal shifts live indices,
  // and the anchor scan below relies on stable positions.
  for (const child of Array.from(list.children)) {
    if (isStale(child)) {
      child.remove();
    }
  }

  const children = list.children;
  for (let i = 0; i < orderedRows.length; i++) {
    const wanted = orderedRows[i];
    if (children[i] !== wanted) {
      // insertBefore MOVES a node that is already elsewhere in the list
      // (never duplicates); a null anchor appends.
      list.insertBefore(wanted, children[i] ?? null);
    }
  }
}
