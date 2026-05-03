'use strict';

/* ══════════════════════════════════════════════════
   pomit Guard — Content Script
   サボりサイトを検知してオーバーレイを表示する
══════════════════════════════════════════════════ */

/* content.css の代わりにJSでスタイルを注入
   （manifest の css 指定を不要にするため） */
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
let currentPhase = 'idle';
let currentDetectSec = 10;
let detectionTimerId = null;

/* ── 起動時に状態を取得 ── */
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
  if (chrome.runtime.lastError) return;
  if (st) handleStateChange(st);
});

/* ── background からの状態変化を受信 ── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATED') {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
      if (chrome.runtime.lastError) return;
      if (st) handleStateChange(st);
    });
  }
});

/* ── 状態に応じてオーバーレイ制御 ── */
function handleStateChange(st) {
  currentPhase = st.phase;
  currentDetectSec = normalizeDetectSec(st.detectSec);

  if (st.phase === 'work') {
    // 作業中 → 設定秒数だけ滞在したらサボり検知
    scheduleDetection(st);
  } else {
    // idle / break → オーバーレイ除去
    clearDetectionTimer();
    removeOverlay();
  }
}

function scheduleDetection(st) {
  clearDetectionTimer();
  if (overlayEl) return;

  detectionTimerId = setTimeout(() => {
    if (currentPhase !== 'work') return;
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (latest) => {
      if (chrome.runtime.lastError) return;
      if (!latest || latest.phase !== 'work') return;
      currentDetectSec = normalizeDetectSec(latest.detectSec);
      chrome.runtime.sendMessage({ type: 'SABORI_DETECTED' });
      showOverlay(latest);
    });
  }, currentDetectSec * 1000);
}

function clearDetectionTimer() {
  if (!detectionTimerId) return;
  clearTimeout(detectionTimerId);
  detectionTimerId = null;
}

/* ══════════════════════════════════════════════════
   OVERLAY
══════════════════════════════════════════════════ */
function showOverlay(st) {
  if (overlayEl) return; // 既に表示中

  const host = document.createElement('div');
  host.id = '__pomit_overlay__';

  // Shadow DOM でサイトのCSSと完全隔離
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(13, 15, 18, 0.92);
      backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Space Mono', 'Courier New', monospace;
      animation: fadeIn 0.25s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to   { opacity: 1; transform: scale(1); }
    }
    .box {
      background: #161a20;
      border: 1px solid #252a33;
      border-radius: 8px;
      padding: 2.5rem 3rem;
      text-align: center;
      max-width: 440px;
      width: 90vw;
      display: flex; flex-direction: column; gap: 1.2rem;
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
    .sub b { color: #e4e8ef; }
    .timer {
      font-size: 2rem; font-weight: 700;
      color: #e4e8ef; letter-spacing: -0.04em;
    }
    .sabori-count {
      font-size: 0.68rem; color: #ff5f57;
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    .btn-row {
      display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;
      margin-top: 0.4rem;
    }
    .btn {
      font-family: inherit; font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.06em; border: none; border-radius: 4px;
      padding: 0.65rem 1.4rem; cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.82; }
    .btn-back {
      background: #e8ff57; color: #0d0f12;
    }
    .btn-ignore {
      background: transparent; color: #5a6070;
      border: 1px solid #252a33;
    }
    .divider { height: 1px; background: #252a33; }
  `;

  const box = document.createElement('div');
  box.className = 'overlay';

  const remaining = calcRemaining(st);
  const sabori = st.saboriCount + 1;

  box.innerHTML = `
    <div class="box">
      <div class="tomato">🍅</div>
      <div class="title">今は作業セッション中です</div>
      <div class="timer" id="__pomit_timer__">${fmtSec(remaining)}</div>
      <div class="sub">
        このサイトは作業中にアクセスしたサボりサイトです。<br>
        <b>休憩まで集中しましょう。</b>
      </div>
      <div class="divider"></div>
      <div class="sabori-count">⚠ 本日のサボり検知: ${sabori}回</div>
      <div class="btn-row">
        <button class="btn btn-back" id="__pomit_back__">← 前のタブに戻る</button>
        <button class="btn btn-ignore" id="__pomit_ignore__">無視して続ける</button>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(box);
  document.documentElement.appendChild(host);
  overlayEl = host;

  // ── ボタンイベント ──
  shadow.getElementById('__pomit_back__').addEventListener('click', () => {
    history.back();
    removeOverlay();
  });

  shadow.getElementById('__pomit_ignore__').addEventListener('click', () => {
    removeOverlay(true); // 無視フラグ付きで閉じる
  });

  // ── カウントダウン更新 ──
  startCountdown(shadow, st);
}

function removeOverlay(ignored = false) {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  if (ignored) {
    // 無視した場合も設定秒数だけ滞在したら再検知
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
      if (chrome.runtime.lastError) return;
      if (st && st.phase === 'work') scheduleDetection(st);
    });
  }
}

/* ══════════════════════════════════════════════════
   COUNTDOWN
══════════════════════════════════════════════════ */
function calcRemaining(st) {
  if (!st.startedAt) return st.workMin * 60;
  const elapsed = Math.floor((Date.now() - st.startedAt) / 1000);
  return Math.max(0, st.workMin * 60 - elapsed);
}

function startCountdown(shadow, st) {
  const timerEl = shadow.getElementById('__pomit_timer__');
  if (!timerEl) return;

  const tick = setInterval(() => {
    const rem = calcRemaining(st);
    if (timerEl) timerEl.textContent = fmtSec(rem);
    if (rem <= 0 || currentPhase !== 'work') {
      clearInterval(tick);
      removeOverlay();
    }
  }, 1000);
}

function fmtSec(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function normalizeDetectSec(sec) {
  const parsed = Number.parseInt(sec, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(3600, Math.max(5, parsed));
}
