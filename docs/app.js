'use strict';

// ── ストレージキー ──────────────────────────────────────
const KEYS = {
  token: 'pomit_token',
  owner: 'pomit_owner',
  repo: 'pomit_repo',
};

// ── DOM ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const inputToken = $('input-token');
const inputOwner = $('input-owner');
const inputRepo = $('input-repo');
const inputMsg = $('input-msg');
const authBadge = $('auth-badge');
const btnVerify = $('btn-verify');
const btnSave = $('btn-save');
const btnClear = $('btn-clear');
const btnCommit = $('btn-commit');
const logEl = $('log');

// ── ログ出力 ────────────────────────────────────────────
function log(text, type = '') {
  const ts = new Date().toLocaleTimeString('ja-JP');
  const line = document.createElement('span');
  line.className = `line ${type}`;
  line.textContent = `[${ts}] ${text}`;
  logEl.appendChild(line);
  logEl.appendChild(document.createElement('br'));
  logEl.scrollTop = logEl.scrollHeight;
}
function logClear() { logEl.innerHTML = ''; }

// ── 認証バッジ更新 ──────────────────────────────────────
function setBadge(state, text) {
  authBadge.className = `badge ${state}`;
  authBadge.textContent = text;
  authBadge.style.setProperty('--dot', '');
}

// ── ローカルストレージ読み込み ──────────────────────────
function loadSaved() {
  const t = localStorage.getItem(KEYS.token);
  const o = localStorage.getItem(KEYS.owner);
  const r = localStorage.getItem(KEYS.repo);
  if (t) inputToken.value = t;
  if (o) inputOwner.value = o;
  if (r) inputRepo.value = r;
  if (t && o && r) {
    setBadge('warn', '保存済み（未検証）');
    btnCommit.disabled = false;
    log('保存済みの認証情報を読み込みました。「接続確認」で検証してください。', 'info');
  }
}

// ── 保存 ────────────────────────────────────────────────
btnSave.addEventListener('click', () => {
  const t = inputToken.value.trim();
  const o = inputOwner.value.trim();
  const r = inputRepo.value.trim();
  if (!t || !o || !r) {
    log('⚠ すべての項目を入力してください。', 'err');
    return;
  }
  localStorage.setItem(KEYS.token, t);
  localStorage.setItem(KEYS.owner, o);
  localStorage.setItem(KEYS.repo, r);
  log('認証情報をlocalStorageに保存しました。', 'acc');
  setBadge('warn', '保存済み（未検証）');
  btnCommit.disabled = false;
});

// ── クリア ──────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  inputToken.value = '';
  inputOwner.value = '';
  inputRepo.value = '';
  setBadge('warn', '未認証');
  btnCommit.disabled = true;
  log('認証情報をクリアしました。', 'info');
});

// ── GitHub API ヘルパー ────────────────────────────────
function getCredentials() {
  return {
    token: inputToken.value.trim() || localStorage.getItem(KEYS.token),
    owner: inputOwner.value.trim() || localStorage.getItem(KEYS.owner),
    repo: inputRepo.value.trim() || localStorage.getItem(KEYS.repo),
  };
}

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

// ── 接続確認 ────────────────────────────────────────────
btnVerify.addEventListener('click', async () => {
  const { token, owner, repo } = getCredentials();
  if (!token || !owner || !repo) {
    log('⚠ トークン・Owner・リポジトリ名を入力してください。', 'err');
    return;
  }

  logClear();
  btnVerify.disabled = true;
  setBadge('info', '確認中...');
  log('GitHub API に接続中...', 'info');

  try {
    // 1. ユーザー確認
    const user = await ghFetch('/user');
    log(`✓ 認証成功: @${user.login}`, 'ok');

    // 2. リポジトリ確認
    const repoData = await ghFetch(`/repos/${owner}/${repo}`);
    log(`✓ リポジトリ確認: ${repoData.full_name}`, 'ok');
    log(`  デフォルトブランチ: ${repoData.default_branch}`, 'info');
    log(`  スコープ: ${repoData.private ? '🔒 Private' : '🌐 Public'}`, 'info');

    setBadge('ok', `認証済み @${user.login}`);
    btnCommit.disabled = false;
    log('疎通確認 完了 ✓ — コミットテストを実行できます。', 'acc');

  } catch (err) {
    setBadge('err', '認証エラー');
    log(`✗ エラー: ${err.message}`, 'err');
    if (err.message.includes('Bad credentials')) {
      log('  → トークンのスコープに "repo" が含まれているか確認してください。', 'err');
    }
    if (err.message.includes('Not Found')) {
      log('  → Owner名・リポジトリ名が正しいか確認してください。', 'err');
    }
    btnCommit.disabled = true;
  } finally {
    btnVerify.disabled = false;
  }
});

// ── テストコミット ─────────────────────────────────────
btnCommit.addEventListener('click', async () => {
  const { token, owner, repo } = getCredentials();
  if (!token || !owner || !repo) {
    log('⚠ 認証情報が不足しています。', 'err');
    return;
  }

  const msg = inputMsg.value.trim() || 'test: Pomit疎通確認';
  btnCommit.disabled = true;
  log('─'.repeat(40), '');
  log(`コミット開始: "${msg}"`, 'info');

  try {
    // 1. デフォルトブランチ取得
    const repoData = await ghFetch(`/repos/${owner}/${repo}`);
    const branch = repoData.default_branch;
    log(`ブランチ: ${branch}`, 'info');

    // 2. 現在のSHA取得（ファイルが既存なら更新、なければ新規）
    const filePath = 'pomit-test/connection-check.md';
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const content = `# Pomit 疎通確認ログ\n\n- 実行日時: ${now}\n- コミットメッセージ: ${msg}\n- 状態: ✅ 成功\n`;
    const encoded = btoa(unescape(encodeURIComponent(content)));

    let sha;
    try {
      const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`);
      sha = existing.sha;
      log(`既存ファイル検出 → 更新モード (sha: ${sha.slice(0, 7)}...)`, 'info');
    } catch {
      log('新規ファイル作成モード', 'info');
    }

    // 3. commit / push（GitHub Contents API）
    const payload = {
      message: msg,
      content: encoded,
      branch,
      ...(sha ? { sha } : {}),
    };

    const result = await ghFetch(
      `/repos/${owner}/${repo}/contents/${filePath}`,
      { method: 'PUT', body: JSON.stringify(payload) }
    );

    const commitSha = result.commit.sha;
    const commitUrl = result.commit.html_url;
    log(`✓ コミット成功!`, 'ok');
    log(`  SHA: ${commitSha.slice(0, 7)}`, 'ok');
    log(`  URL: ${commitUrl}`, 'acc');
    log('─'.repeat(40), '');
    log('🎉 疎通確認・commit/push 完全成功！', 'acc');

  } catch (err) {
    log(`✗ コミット失敗: ${err.message}`, 'err');
    if (err.message.includes('422')) {
      log('  → sha の不一致。もう一度「接続確認」→「コミット」を試してください。', 'err');
    }
  } finally {
    btnCommit.disabled = false;
  }
});

// ── 初期化 ─────────────────────────────────────────────
loadSaved();
