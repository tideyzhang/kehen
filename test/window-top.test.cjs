const test = require('node:test');
const assert = require('node:assert');
const { TOP_LEVEL, applyTop, fixTop, shouldKeep } = require('../src/window-top.cjs');

function mockWin(over = {}) {
  const calls = [];
  const win = {
    calls, destroyed: false, visible: true, minimized: false,
    isDestroyed: () => win.destroyed,
    isVisible: () => win.visible,
    isMinimized: () => win.minimized,
    setAlwaysOnTop: (on, level) => calls.push({ on, level }),
    moveTop: () => calls.push({ moveTop: true })
  };
  return Object.assign(win, over);
}

test('置顶级别固定为 screen-saver，不使用普通层级', () => {
  assert.equal(TOP_LEVEL, 'screen-saver');
  const win = mockWin();
  assert.equal(applyTop(win, true), true);
  assert.deepEqual(win.calls[0], { on: true, level: 'screen-saver' });
  assert.deepEqual(win.calls[1], { moveTop: true }, '开启置顶后应提升到最前');
});

test('取消置顶时仍带层级参数，不产生无参调用', () => {
  const win = mockWin();
  applyTop(win, false);
  assert.equal(win.calls.length, 1, '取消置顶不应触发 moveTop');
  assert.deepEqual(win.calls[0], { on: false, level: 'screen-saver' });
});

test('关闭再开启置顶不会降级为普通层级', () => {
  const win = mockWin();
  applyTop(win, false);
  applyTop(win, true);
  const levels = win.calls.filter(c => c.level !== undefined).map(c => c.level);
  assert.deepEqual(levels, ['screen-saver', 'screen-saver'], '两次调用都必须带 screen-saver 层级');
});

test('手动修复先降后升，强制重排 Z 序', () => {
  const win = mockWin();
  assert.equal(fixTop(win), true);
  assert.deepEqual(win.calls[0], { on: false, level: 'screen-saver' });
  assert.deepEqual(win.calls[1], { on: true, level: 'screen-saver' });
  assert.deepEqual(win.calls[2], { moveTop: true });
});

test('定时重申仅在已置顶且窗口可见未最小化时进行', () => {
  assert.equal(shouldKeep(mockWin(), true), true);
  assert.equal(shouldKeep(mockWin(), false), false, '未开启置顶时不应重申');
  assert.equal(shouldKeep(mockWin({ minimized: true }), true), false, '最小化时不应重申');
  assert.equal(shouldKeep(mockWin({ visible: false }), true), false, '隐藏时不应重申');
  const dead = mockWin({ destroyed: true });
  assert.equal(shouldKeep(dead, true), false);
});

test('窗口已销毁时所有操作安全跳过', () => {
  const win = mockWin({ destroyed: true });
  assert.equal(applyTop(win, true), false);
  assert.equal(fixTop(win), false);
  assert.equal(win.calls.length, 0, '已销毁窗口不应收到任何调用');
});
