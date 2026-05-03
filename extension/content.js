'use strict';

/* ══════════════════════════════════════════════════
   Pomit Guard — Content Script
   サボりサイトの滞在通知、またはアクセスブロックを行う
══════════════════════════════════════════════════ */

(function injectGlobalStyle() {
  const style = document.createElement('style');
  style.id = '__pomit_global_style__';
  style.textContent = `
    body:has(#__pomit_overlay__) {
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();

let overlayEl = null;
let detectionTimerId = null;
let hasRecordedForThisPage = false;

chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
  if (chrome.runtime.lastError) return;
  if (st) applyState(st);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'STATE_UPDATED') return;
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
    if (chrome.runtime.lastError) return;
    if (st) applyState(st);
  });
});

function applyState(st) {
  clearDetectionTimer();

  if (!st.enabled) {
    removeOverlay();
    return;
  }

  if (st.mode === 'block') {
    recordOnce('block');
    showBlockOverlay(st);
    return;
  }

  removeOverlay();
  scheduleNotification(st);
}

function scheduleNotification(st) {
  const detectSec = normalizeDetectSec(st.detectSec);
  detectionTimerId = setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (latest) => {
      if (chrome.runtime.lastError) return;
      if (!latest || !latest.enabled || latest.mode !== 'notify') return;
      recordOnce('notify');
    });
  }, detectSec * 1000);
}

function recordOnce(reason) {
  if (hasRecordedForThisPage) return;
  hasRecordedForThisPage = true;
  chrome.runtime.sendMessage({ type: 'SABORI_DETECTED', reason });
}

function clearDetectionTimer() {
  if (!detectionTimerId) return;
  clearTimeout(detectionTimerId);
  detectionTimerId = null;
}

function showBlockOverlay(st) {
  if (overlayEl) return;

  const host = document.createElement('div');
  host.id = '__pomit_overlay__';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(13, 15, 18, 0.94);
      backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Space Mono', 'Courier New', monospace;
    }
    .box {
      background: #161a20;
      border: 1px solid #252a33;
      border-radius: 8px;
      padding: 2.5rem 3rem;
      text-align: center;
      max-width: 440px;
      width: 90vw;
      display: flex; flex-direction: column; gap: 1.1rem;
    }
    .tomato { font-size: 3rem; line-height: 1; }
    .title {
      font-size: 1rem; font-weight: 700;
      color: #e8ff57; letter-spacing: -0.02em;
    }
    .sub {
      font-size: 0.78rem; color: #5a6070;
      line-height: 1.6;
    }
    .count {
      font-size: 0.68rem; color: #ff5f57;
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    .btn {
      font-family: inherit; font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.06em; border: none; border-radius: 4px;
      padding: 0.65rem 1.4rem; cursor: pointer;
      background: #e8ff57; color: #0d0f12;
    }
    .divider { height: 1px; background: #252a33; }
  `;

  const box = document.createElement('div');
  box.className = 'overlay';
  box.innerHTML = `
    <div class="box">
      <div class="tomato">🍅</div>
      <div class="title">Pomit Guard がブロック中です</div>
      <div class="sub">
        このサイトはサボりサイトとして監視対象です。<br>
        ブロックを解除するには拡張機能の popup でOFFにしてください。
      </div>
      <div class="divider"></div>
      <div class="count">本日のサボり検知: ${st.saboriCount + 1}回</div>
      <button class="btn" id="__pomit_back__">← 前のページに戻る</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(box);
  document.documentElement.appendChild(host);
  overlayEl = host;

  shadow.getElementById('__pomit_back__').addEventListener('click', () => {
    history.back();
  });
}

function removeOverlay() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
}

function normalizeDetectSec(sec) {
  const parsed = Number.parseInt(sec, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(3600, Math.max(5, parsed));
}
