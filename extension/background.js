'use strict';

/* ══════════════════════════════════════════════════
   Pomit Guard — Background Service Worker
   サボり検知のON/OFF、検知モード、検知回数を管理する
══════════════════════════════════════════════════ */

const DEFAULT_STATE = {
  enabled: false,
  mode: 'notify',      // 'notify' | 'block'
  detectSec: 10,
  saboriCount: 0,
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('pomitState');
  await chrome.storage.local.set({
    pomitState: { ...DEFAULT_STATE, ...(existing.pomitState || {}) },
  });
  console.log('[Pomit Guard] installed / updated');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATE':
      getState().then(sendResponse);
      return true;

    case 'SET_ENABLED':
      setEnabled(msg.enabled).then(sendResponse);
      return true;

    case 'SET_MODE':
      setMode(msg.mode).then(sendResponse);
      return true;

    case 'SET_DETECT_SEC':
      setDetectSec(msg.detectSec).then(sendResponse);
      return true;

    case 'RESET_SABORI_COUNT':
      resetSaboriCount().then(sendResponse);
      return true;

    case 'SABORI_DETECTED':
      recordSabori(msg.reason).then(sendResponse);
      return true;
  }
});

async function getState() {
  const { pomitState } = await chrome.storage.local.get('pomitState');
  return { ...DEFAULT_STATE, ...(pomitState || {}) };
}

async function updateState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ pomitState: next });
  return next;
}

async function setEnabled(enabled) {
  const next = await updateState({ enabled: Boolean(enabled) });
  broadcastState();
  return next;
}

async function setMode(mode) {
  const next = await updateState({ mode: mode === 'block' ? 'block' : 'notify' });
  broadcastState();
  return next;
}

async function setDetectSec(sec) {
  const next = await updateState({ detectSec: normalizeDetectSec(sec) });
  broadcastState();
  return next;
}

async function resetSaboriCount() {
  const next = await updateState({ saboriCount: 0 });
  broadcastState();
  return next;
}

async function recordSabori(reason = 'notify') {
  const st = await getState();
  const next = await updateState({ saboriCount: st.saboriCount + 1 });

  chrome.notifications.create(`sabori_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: reason === 'block' ? '⛔ サボりサイトをブロックしました' : '⚠ サボりサイトを検知しました',
    message: reason === 'block'
      ? 'Pomit Guard がONのため、このサイトへのアクセスをブロックしています。'
      : `${next.detectSec}秒以上サボりサイトに滞在しています。作業に戻りましょう。`,
    priority: 2,
  });

  broadcastState();
  return next;
}

function normalizeDetectSec(sec) {
  const parsed = Number.parseInt(sec, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STATE.detectSec;
  return Math.min(3600, Math.max(5, parsed));
}

function broadcastState() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATED' }).catch(() => {});
    });
  });
}
