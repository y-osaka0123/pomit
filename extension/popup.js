'use strict';

/* ══════════════════════════════════════════════════
   Pomit Guard — Popup Script
══════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const statusBadge = $('status-badge');
const statusText = $('status-text');
const statSabori = $('stat-sabori');
const inpDetect = $('inp-detect');
const btnToggle = $('btn-toggle');
const btnReset = $('btn-reset');
const modeNotify = $('mode-notify');
const modeBlock = $('mode-block');

chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
  if (chrome.runtime.lastError) return;
  applyState(st);
});

btnToggle.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (st) => {
    if (chrome.runtime.lastError || !st) return;
    chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled: !st.enabled }, applyState);
  });
});

btnReset.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_SABORI_COUNT' }, applyState);
});

modeNotify.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode: 'notify' }, applyState);
});

modeBlock.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode: 'block' }, applyState);
});

inpDetect.addEventListener('change', () => {
  const detectSec = normalizeDetectSec(inpDetect.value);
  inpDetect.value = detectSec;
  chrome.runtime.sendMessage({ type: 'SET_DETECT_SEC', detectSec }, applyState);
});

function applyState(st) {
  if (!st) return;

  statusBadge.className = `status-badge ${st.enabled ? 'on' : 'off'}`;
  statusBadge.textContent = st.enabled ? 'ON' : 'OFF';
  statusText.textContent = st.enabled
    ? (st.mode === 'block' ? 'アクセスブロック中' : '滞在時間を監視中')
    : '監視停止中';

  statSabori.textContent = st.saboriCount || 0;
  inpDetect.value = normalizeDetectSec(st.detectSec);
  inpDetect.disabled = st.mode === 'block';
  btnToggle.textContent = st.enabled ? '■ OFFにする' : '● ONにする';
  btnToggle.className = `btn ${st.enabled ? 'btn-danger' : 'btn-primary'}`;

  modeNotify.classList.toggle('active', st.mode !== 'block');
  modeBlock.classList.toggle('active', st.mode === 'block');
}

function normalizeDetectSec(sec) {
  const parsed = Number.parseInt(sec, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(3600, Math.max(5, parsed));
}
