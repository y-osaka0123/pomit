'use strict';

/* ══════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════ */
const STORE = {
  token: 'pomit_token',
  owner: 'pomit_owner',
  repo: 'pomit_repo',
  filepath: 'pomit_filepath',
  workMin: 'pomit_work_min',
  breakMin: 'pomit_break_min',
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 88; // ≈ 552.92

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const state = {
  // timer
  mode: 'work',    // 'work' | 'break'
  running: false,
  remaining: 0,         // seconds
  totalSec: 0,         // full duration seconds
  intervalId: null,
  sessionNum: 1,
  // stats
  sessions: 0,
  commits: 0,
  totalWorkSec: 0,
  // task
  task: '',
  // history
  history: [],
};

/* ══════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors so UI actions still work.
  }
}
// header
const authBadgeHeader = $('auth-badge-header');
const btnGotoSettings = $('btn-goto-settings');
const notifBar = $('notif-bar');
const btnNotifEnable = $('btn-notif-enable');

// views
const viewSettings = $('view-settings');
const viewStart = $('view-start');
const viewTimer = $('view-timer');

// settings
const inputToken = $('input-token');
const inputOwner = $('input-owner');
const inputRepo = $('input-repo');
const inputFilepath = $('input-filepath');
const inputWorkMin = $('input-work-min');
const inputBreakMin = $('input-break-min');
const authBadge = $('auth-badge');
const btnVerify = $('btn-verify');
const btnSave = $('btn-save');
const btnClear = $('btn-clear');
const authLog = $('auth-log');
const btnSettingsDone = $('btn-settings-done');

// start
const inputTask = $('input-task');
const btnStartPomodoro = $('btn-start-pomodoro');

// timer
const statSessions = $('stat-sessions');
const statCommits = $('stat-commits');
const statElapsed = $('stat-elapsed');
const sessionLabel = $('session-label');
const sessionCount = $('session-count');
const ringProgress = $('ring-progress');
const ringTime = $('ring-time');
const ringMode = $('ring-mode');
const btnTimerToggle = $('btn-timer-toggle');
const btnTimerReset = $('btn-timer-reset');
const btnBackToStart = $('btn-back-to-start');
const taskDisplay = $('task-display');

// progress
const progressCard = $('progress-card');
const inputProgress = $('input-progress');
const btnCommitProgress = $('btn-commit-progress');
const btnSkipCommit = $('btn-skip-commit');
const commitLog = $('commit-log');

// history
const historyCard = $('history-card');
const commitHistory = $('commit-history');

/* ══════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════ */
function getCredentials() {
  return {
    token: inputToken.value.trim() || storageGet(STORE.token) || '',
    owner: inputOwner.value.trim() || storageGet(STORE.owner) || '',
    repo: inputRepo.value.trim() || storageGet(STORE.repo) || '',
    filepath: inputFilepath.value.trim() || storageGet(STORE.filepath) || 'pomit-logs/progress.md',
  };
}

function fmtSeconds(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtMinutes(sec) {
  const m = Math.floor(sec / 60);
  return `${m}m`;
}

function nowJST() {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function addLog(el, text, type = '') {
  const ts = new Date().toLocaleTimeString('ja-JP');
  const line = document.createElement('span');
  line.className = `line ${type}`;
  line.textContent = `[${ts}] ${text}`;
  el.appendChild(line);
  el.appendChild(document.createElement('br'));
  el.scrollTop = el.scrollHeight;
}

function clearLog(el) { el.innerHTML = ''; }

function setAuthBadge(badgeState, text) {
  [authBadge, authBadgeHeader].forEach(el => {
    el.className = `badge ${badgeState}`;
    el.textContent = text;
  });
}

function showView(name) {
  [viewSettings, viewStart, viewTimer].forEach(v => v.classList.remove('active'));
  if (name === 'settings') viewSettings.classList.add('active');
  if (name === 'start') viewStart.classList.add('active');
  if (name === 'timer') viewTimer.classList.add('active');
}

/* ══════════════════════════════════════════════════
   NOTIFICATION
══════════════════════════════════════════════════ */
function checkNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    notifBar.classList.add('show');
  }
}

btnNotifEnable.addEventListener('click', async () => {
  const perm = await Notification.requestPermission();
  if (perm === 'granted') notifBar.classList.remove('show');
});

function sendNotif(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' });
  }
}

function beep(freq = 880, duration = 180, vol = 0.3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.start(); osc.stop(ctx.currentTime + duration / 1000);
  } catch { /* ユーザー操作前はブラウザが許可しないため無視 */ }
}

/* ══════════════════════════════════════════════════
   GITHUB API
══════════════════════════════════════════════════ */
async function ghFetch(path, options = {}) {
  const { token } = getCredentials();
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function commitProgress(progressText, sessionNum) {
  const { owner, repo, filepath } = getCredentials();
  const now = nowJST();
  const todayStr = new Date().toLocaleDateString('ja-JP');
  const msgShort = `📝 Session #${sessionNum} — ${todayStr}`;

  const content =
    `## Session #${sessionNum} — ${now}\n\n` +
    `### 今日の目標\n${state.task}\n\n` +
    `### 実施内容\n${progressText}\n\n---\n\n`;

  // 既存ファイルのSHA取得（追記のため）
  let existingSha, existingContent = '';
  try {
    const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${filepath}`);
    existingSha = existing.sha;
    existingContent = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ''))));
  } catch {
    // 新規ファイル
  }

  const newContent = content + existingContent;
  const encoded = btoa(unescape(encodeURIComponent(newContent)));

  const payload = {
    message: msgShort,
    content: encoded,
    ...(existingSha ? { sha: existingSha } : {}),
  };

  const result = await ghFetch(
    `/repos/${owner}/${repo}/contents/${filepath}`,
    { method: 'PUT', body: JSON.stringify(payload) }
  );

  return {
    sha: result.commit.sha,
    url: result.commit.html_url,
    msg: msgShort,
  };
}

/* ══════════════════════════════════════════════════
   SETTINGS VIEW
══════════════════════════════════════════════════ */
function loadSaved() {
  const t = storageGet(STORE.token);
  const o = storageGet(STORE.owner);
  const r = storageGet(STORE.repo);
  const f = storageGet(STORE.filepath);
  const w = storageGet(STORE.workMin);
  const b = storageGet(STORE.breakMin);
  if (t) inputToken.value = t;
  if (o) inputOwner.value = o;
  if (r) inputRepo.value = r;
  if (f) inputFilepath.value = f;
  if (w) inputWorkMin.value = w;
  if (b) inputBreakMin.value = b;
  if (t && o && r) {
    setAuthBadge('warn', '保存済み（未検証）');
  }
}

btnSave.addEventListener('click', () => {
  const t = inputToken.value.trim();
  const o = inputOwner.value.trim();
  const r = inputRepo.value.trim();
  if (!t || !o || !r) {
    addLog(authLog, '⚠ トークン・Owner・リポジトリを入力してください', 'err');
    return;
  }
  storageSet(STORE.token, t);
  storageSet(STORE.owner, o);
  storageSet(STORE.repo, r);
  storageSet(STORE.filepath, inputFilepath.value.trim() || 'pomit-logs/progress.md');
  storageSet(STORE.workMin, inputWorkMin.value);
  storageSet(STORE.breakMin, inputBreakMin.value);
  addLog(authLog, '認証情報を保存しました', 'acc');
  setAuthBadge('warn', '保存済み（未検証）');
});

btnClear.addEventListener('click', () => {
  Object.values(STORE).forEach(k => storageRemove(k));
  inputToken.value = inputOwner.value = inputRepo.value = '';
  inputFilepath.value = '';
  setAuthBadge('warn', '未認証');
  addLog(authLog, '認証情報をクリアしました', 'info');
});

btnVerify.addEventListener('click', async () => {
  const { token, owner, repo } = getCredentials();
  if (!token || !owner || !repo) {
    addLog(authLog, '⚠ すべての項目を入力してください', 'err'); return;
  }
  clearLog(authLog);
  btnVerify.disabled = true;
  setAuthBadge('info', '確認中...');
  addLog(authLog, 'GitHub API に接続中...', 'info');
  try {
    const user = await ghFetch('/user');
    addLog(authLog, `✓ 認証成功: @${user.login}`, 'ok');
    const repoData = await ghFetch(`/repos/${owner}/${repo}`);
    addLog(authLog, `✓ リポジトリ: ${repoData.full_name}  [${repoData.private ? 'Private' : 'Public'}]`, 'ok');
    addLog(authLog, `  デフォルトブランチ: ${repoData.default_branch}`, 'info');
    setAuthBadge('ok', `認証済み @${user.login}`);
    addLog(authLog, '疎通確認 完了 ✓', 'acc');
  } catch (err) {
    setAuthBadge('err', '認証エラー');
    addLog(authLog, `✗ ${err.message}`, 'err');
    if (err.message.includes('Bad credentials'))
      addLog(authLog, '  → Token の repo スコープを確認してください', 'err');
    if (err.message.includes('Not Found'))
      addLog(authLog, '  → Owner名 / リポジトリ名を確認してください', 'err');
  } finally {
    btnVerify.disabled = false;
  }
});

btnSettingsDone.addEventListener('click', () => {
  // タイマー設定を保存
  storageSet(STORE.workMin, inputWorkMin.value);
  storageSet(STORE.breakMin, inputBreakMin.value);
  storageSet(STORE.filepath, inputFilepath.value.trim() || 'pomit-logs/progress.md');
  showView('start');
});

btnGotoSettings.addEventListener('click', () => {
  stopTimer();
  showView('settings');
});

/* ══════════════════════════════════════════════════
   START VIEW
══════════════════════════════════════════════════ */
btnStartPomodoro.addEventListener('click', () => {
  const task = inputTask.value.trim();
  if (!task) {
    inputTask.focus();
    inputTask.style.borderColor = 'var(--danger)';
    setTimeout(() => inputTask.style.borderColor = '', 1500);
    return;
  }
  state.task = task;
  taskDisplay.textContent = task;
  initTimer('work');
  showView('timer');
});

/* ══════════════════════════════════════════════════
   TIMER
══════════════════════════════════════════════════ */
function getWorkSec() {
  const min = parseInt(inputWorkMin.value || storageGet(STORE.workMin) || 25, 10);
  return Math.max(1, Number.isFinite(min) ? min : 25) * 60;
}
function getBreakSec() {
  const min = parseInt(inputBreakMin.value || storageGet(STORE.breakMin) || 5, 10);
  return Math.max(1, Number.isFinite(min) ? min : 5) * 60;
}

function initTimer(mode) {
  stopTimer();
  state.mode = mode;
  state.running = false;
  state.totalSec = mode === 'work' ? getWorkSec() : getBreakSec();
  state.remaining = state.totalSec;
  updateTimerUI();
  progressCard.style.display = 'none';
  btnTimerToggle.textContent = '▶ スタート';
  btnTimerToggle.className = 'btn btn-primary btn-timer-main';
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  btnTimerToggle.textContent = '⏸ 一時停止';
  btnTimerToggle.className = 'btn btn-ghost btn-timer-main';
  state.intervalId = setInterval(() => {
    if (state.remaining > 0) {
      state.remaining--;
      if (state.mode === 'work') state.totalWorkSec++;
      updateTimerUI();
    } else {
      clearInterval(state.intervalId);
      state.running = false;
      onTimerEnd();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.intervalId);
  state.running = false;
  btnTimerToggle.textContent = '▶ 再開';
  btnTimerToggle.className = 'btn btn-primary btn-timer-main';
}

function stopTimer() {
  clearInterval(state.intervalId);
  state.running = false;
}

function resetTimer() {
  stopTimer();
  initTimer(state.mode);
}

function updateTimerUI() {
  // time text
  ringTime.textContent = fmtSeconds(state.remaining);
  ringTime.classList.toggle('pulse', state.remaining <= 10 && state.running);

  // ring
  const progress = state.remaining / state.totalSec;
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  ringProgress.style.strokeDashoffset = offset;
  ringProgress.classList.toggle('break', state.mode === 'break');

  // mode label
  if (state.mode === 'work') {
    ringMode.textContent = 'WORK';
    ringMode.className = 'ring-mode work';
    sessionLabel.textContent = '作業セッション';
  } else {
    ringMode.textContent = 'BREAK';
    ringMode.className = 'ring-mode break';
    sessionLabel.textContent = '休憩セッション';
  }
  sessionCount.textContent = `#${state.sessionNum}`;

  // stats
  statSessions.textContent = state.sessions;
  statCommits.textContent = state.commits;
  statElapsed.textContent = fmtMinutes(state.totalWorkSec);

  // document title
  document.title = `${fmtSeconds(state.remaining)} — Pomit`;
}

function onTimerEnd() {
  beep(880, 200);
  setTimeout(() => beep(1100, 200), 250);
  setTimeout(() => beep(1320, 300), 500);

  if (state.mode === 'work') {
    state.sessions++;
    sendNotif('🍅 作業セッション完了！', `セッション #${state.sessionNum} が終了しました。進捗を入力してください。`);
    // 進捗パネル表示
    progressCard.style.display = 'flex';
    progressCard.style.flexDirection = 'column';
    clearLog(commitLog);
    inputProgress.value = '';
    inputProgress.focus();
    btnTimerToggle.textContent = '▶ スタート';
    btnTimerToggle.className = 'btn btn-primary btn-timer-main';
    updateTimerUI();
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    // 休憩終了
    sendNotif('☕ 休憩終了！', '次のセッションを開始しましょう。');
    state.sessionNum++;
    initTimer('work');
    updateTimerUI();
  }
}

/* ── timer button handlers ── */
btnTimerToggle.addEventListener('click', () => {
  if (state.running) {
    pauseTimer();
  } else {
    startTimer();
  }
});

btnTimerReset.addEventListener('click', resetTimer);

btnBackToStart.addEventListener('click', () => {
  stopTimer();
  document.title = 'Pomit — Pomodoro × Commit';
  showView('start');
});

/* ══════════════════════════════════════════════════
   PROGRESS / COMMIT
══════════════════════════════════════════════════ */
btnCommitProgress.addEventListener('click', async () => {
  const progress = inputProgress.value.trim();
  if (!progress) {
    inputProgress.focus();
    inputProgress.style.borderColor = 'var(--danger)';
    setTimeout(() => inputProgress.style.borderColor = '', 1500);
    return;
  }

  const { token, owner, repo } = getCredentials();
  if (!token || !owner || !repo) {
    addLog(commitLog, '⚠ 認証情報が未設定です。設定画面で入力してください', 'err');
    return;
  }

  btnCommitProgress.disabled = true;
  btnSkipCommit.disabled = true;
  clearLog(commitLog);
  addLog(commitLog, `コミット中... Session #${state.sessionNum}`, 'info');

  try {
    const result = await commitProgress(progress, state.sessionNum);
    state.commits++;
    addLog(commitLog, `✓ コミット成功: ${result.sha.slice(0, 7)}`, 'ok');
    addLog(commitLog, `  ${result.msg}`, 'acc');

    // 履歴に追加
    state.history.unshift({ sha: result.sha, msg: result.msg, url: result.url });
    renderHistory();

    // stats 更新
    updateTimerUI();

    addLog(commitLog, '休憩へ移行します...', 'info');
    setTimeout(() => {
      progressCard.style.display = 'none';
      initTimer('break');
      startTimer();
    }, 1500);

  } catch (err) {
    addLog(commitLog, `✗ エラー: ${err.message}`, 'err');
    if (err.message.includes('Bad credentials'))
      addLog(commitLog, '  → 設定画面でトークンを確認してください', 'err');
  } finally {
    btnCommitProgress.disabled = false;
    btnSkipCommit.disabled = false;
  }
});

btnSkipCommit.addEventListener('click', () => {
  progressCard.style.display = 'none';
  initTimer('break');
  startTimer();
});

function renderHistory() {
  if (state.history.length === 0) return;
  historyCard.style.display = 'flex';
  commitHistory.innerHTML = '';
  state.history.slice(0, 10).forEach(item => {
    const el = document.createElement('div');
    el.className = 'commit-item';
    el.innerHTML = `
      <span class="commit-sha">${item.sha.slice(0, 7)}</span>
      <span class="commit-msg">${item.msg}</span>
      <a href="${item.url}" target="_blank" class="commit-ts" style="color:var(--accent2);text-decoration:none;">↗</a>
    `;
    commitHistory.appendChild(el);
  });
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
loadSaved();
checkNotifPermission();

// タイマー初期表示
ringTime.textContent = fmtSeconds(getWorkSec());
ringProgress.style.strokeDashoffset = 0;
