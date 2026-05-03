'use strict';

/* ══════════════════════════════════════════════════
   Pomit Guard — Popup Script
══════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const phaseBadge   = $('phase-badge');
const timerVal     = $('timer-val');
const timerLabel   = $('timer-label');
const statSessions = $('stat-sessions');
const statSabori   = $('stat-sabori');
const statPhase    = $('stat-phase');
const btnWork      = $('btn-work');
const btnBreak     = $('btn-break');
const btnStop      = $('btn-stop');
const inpWork      = $('inp-work');
const inpBreak     = $('inp-break');
const modeWarn     = $('mode-warn');
const modeRedirect = $('mode-redirect');

let currentState = null;
let tickInterval = null;

/* ── 初期ロード ── */
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
  if (chrome.runtime.lastError) return;
  applyState(st);
});

/* ── ボタンイベント ── */
btnWork.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'START_WORK',
    workMin:  parseInt(inpWork.value,  10),
    breakMin: parseInt(inpBreak.value, 10),
  }, applyState);
});

btnBreak.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'START_BREAK',
    workMin:  parseInt(inpWork.value,  10),
    breakMin: parseInt(inpBreak.value, 10),
  }, applyState);
});

btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP' }, applyState);
});

modeWarn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SET_BLOCK_MODE', blockMode: 'warn' }, applyState);
});

modeRedirect.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SET_BLOCK_MODE', blockMode: 'redirect' }, applyState);
});

/* ── 設定値を storage から復元 ── */
chrome.storage.local.get('pomitState', ({ pomitState }) => {
  if (!pomitState) return;
  if (pomitState.workMin)  inpWork.value  = pomitState.workMin;
  if (pomitState.breakMin) inpBreak.value = pomitState.breakMin;
});

/* ══════════════════════════════════════════════════
   UI UPDATE
══════════════════════════════════════════════════ */
function applyState(st) {
  if (!st) return;
  currentState = st;

  // phase badge
  phaseBadge.className = `phase-badge ${st.phase}`;
  phaseBadge.textContent = phaseLabel(st.phase);

  // stats
  statSessions.textContent = st.sessions;
  statSabori.textContent   = st.saboriCount;
  statPhase.textContent    = phaseLabel(st.phase);

  // block mode toggle
  modeWarn.classList.toggle('active',     st.blockMode === 'warn');
  modeRedirect.classList.toggle('active', st.blockMode === 'redirect');

  // buttons
  if (st.phase === 'idle') {
    btnWork.style.display  = '';
    btnBreak.style.display = 'none';
    btnStop.style.display  = 'none';
    timerVal.textContent   = '--:--';
    timerLabel.textContent = '待機中';
  } else if (st.phase === 'work') {
    btnWork.style.display  = 'none';
    btnBreak.style.display = '';
    btnStop.style.display  = '';
    timerLabel.textContent = '作業残り時間';
  } else if (st.phase === 'break') {
    btnWork.style.display  = 'none';
    btnBreak.style.display = 'none';
    btnStop.style.display  = '';
    timerLabel.textContent = '休憩残り時間';
  }

  // countdown
  clearInterval(tickInterval);
  if (st.phase !== 'idle' && st.startedAt) {
    tickCountdown(st);
    tickInterval = setInterval(() => tickCountdown(st), 1000);
  }
}

function tickCountdown(st) {
  const totalSec = (st.phase === 'work' ? st.workMin : st.breakMin) * 60;
  const elapsed  = Math.floor((Date.now() - st.startedAt) / 1000);
  const rem      = Math.max(0, totalSec - elapsed);
  timerVal.textContent = fmtSec(rem);
  if (rem === 0) clearInterval(tickInterval);
}

function phaseLabel(phase) {
  return { idle: 'IDLE', work: 'WORK', break: 'BREAK' }[phase] || 'IDLE';
}

function fmtSec(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
