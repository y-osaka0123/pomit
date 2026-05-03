'use strict';

/* ══════════════════════════════════════════════════
   Pomit Guard — Background Service Worker
   タイマー状態を chrome.storage で管理し、
   content.js / popup.js に状態を配信する
══════════════════════════════════════════════════ */

const DEFAULT_STATE = {
  phase: 'idle',        // 'idle' | 'work' | 'break'
  startedAt: null,      // timestamp (ms)
  workMin: 25,
  breakMin: 5,
  detectSec: 10,
  blockMode: 'warn',    // 'warn' | 'redirect'
  sessions: 0,
  saboriCount: 0,
};

/* ── 初期化 ── */
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('pomitState');
  if (!existing.pomitState) {
    await chrome.storage.local.set({ pomitState: { ...DEFAULT_STATE } });
  }
  console.log('[Pomit Guard] installed / updated');
});

/* ── メッセージハンドラ ── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case 'GET_STATE':
      getState().then(sendResponse);
      return true; // async

    case 'START_WORK':
      startPhase('work', msg.workMin, msg.breakMin).then(sendResponse);
      return true;

    case 'START_BREAK':
      startPhase('break', msg.workMin, msg.breakMin).then(sendResponse);
      return true;

    case 'STOP':
      stopAll().then(sendResponse);
      return true;

    case 'SET_BLOCK_MODE':
      setBlockMode(msg.blockMode).then(sendResponse);
      return true;

    case 'SET_DETECT_SEC':
      setDetectSec(msg.detectSec).then(sendResponse);
      return true;

    case 'SABORI_DETECTED':
      recordSabori().then(sendResponse);
      return true;
  }
});

/* ── アラームハンドラ ── */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const st = await getState();

  if (alarm.name === 'pomit_work_end') {
    // 作業終了 → 通知
    chrome.notifications.create('work_end', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '🍅 作業セッション完了！',
      message: 'お疲れ様です。Pomit で進捗を記録してください。',
      priority: 2,
    });
    await updateState({
      phase: 'idle',
      sessions: st.sessions + 1,
    });
    broadcastState();
  }

  if (alarm.name === 'pomit_break_end') {
    // 休憩終了 → 通知
    chrome.notifications.create('break_end', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '☕ 休憩終了！',
      message: '次のセッションを開始しましょう。',
      priority: 2,
    });
    await updateState({ phase: 'idle' });
    broadcastState();
  }
});

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
async function getState() {
  const { pomitState } = await chrome.storage.local.get('pomitState');
  return { ...DEFAULT_STATE, ...(pomitState || {}) };
}

async function updateState(patch) {
  const current = await getState();
  const next    = { ...current, ...patch };
  await chrome.storage.local.set({ pomitState: next });
  return next;
}

async function startPhase(phase, workMin, breakMin) {
  // 既存アラームをクリア
  await chrome.alarms.clearAll();

  const mins = phase === 'work'
    ? (workMin  || 25)
    : (breakMin || 5);

  chrome.alarms.create(`pomit_${phase}_end`, {
    delayInMinutes: Number(mins),
  });

  const next = await updateState({
    phase,
    startedAt: Date.now(),
    workMin:   workMin  || 25,
    breakMin:  breakMin || 5,
  });

  broadcastState();
  return next;
}

async function stopAll() {
  await chrome.alarms.clearAll();
  const next = await updateState({ phase: 'idle', startedAt: null });
  broadcastState();
  return next;
}

async function setBlockMode(mode) {
  const next = await updateState({ blockMode: mode });
  broadcastState();
  return next;
}

async function setDetectSec(sec) {
  const detectSec = normalizeDetectSec(sec);
  const next = await updateState({ detectSec });
  broadcastState();
  return next;
}

async function recordSabori() {
  const st   = await getState();
  const next = await updateState({ saboriCount: st.saboriCount + 1 });
  chrome.notifications.create(`sabori_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '⚠ サボりサイトを検知しました',
    message: `${next.detectSec}秒以上サボりサイトに滞在しています。作業に戻りましょう。`,
    priority: 2,
  });
  return next;
}

function normalizeDetectSec(sec) {
  const parsed = Number.parseInt(sec, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STATE.detectSec;
  return Math.min(3600, Math.max(5, parsed));
}

/* 全タブに状態変化を broadcast */
function broadcastState() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATED' })
        .catch(() => {}); // コンテントスクリプト未挿入タブは無視
    });
  });
}
