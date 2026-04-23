/**
 * True when the active text selection is non-empty and anchored inside `el`.
 * Used to distinguish "user clicked this element" from "user is mid-drag
 * selecting text inside it" — so click-to-open doesn't steal a copy gesture.
 */
export function isSelectingTextIn(el: Element): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  if (sel.toString().length === 0) return false;
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  return (
    (!!anchor && el.contains(anchor)) || (!!focus && el.contains(focus))
  );
}
