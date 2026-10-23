const TOP_LEVEL = 'screen-saver';

function usable(win) { return !!win && typeof win.isDestroyed === 'function' && !win.isDestroyed(); }

function applyTop(win, on) {
  if (!usable(win)) return false;
  win.setAlwaysOnTop(!!on, TOP_LEVEL);
  if (on) { try { win.moveTop(); } catch {} }
  return true;
}

function fixTop(win) {
  if (!usable(win)) return false;
  win.setAlwaysOnTop(false, TOP_LEVEL);
  win.setAlwaysOnTop(true, TOP_LEVEL);
  try { win.moveTop(); } catch {}
  return true;
}

function shouldKeep(win, pinned) {
  if (!pinned || !usable(win)) return false;
  try { return win.isVisible() && !win.isMinimized(); } catch { return false; }
}

module.exports = { TOP_LEVEL, applyTop, fixTop, shouldKeep };
