(function () {
  const state = window.__INITIAL_STATE__ || {};

  const tgWebApp = window.Telegram?.WebApp;
  const tgInitData = state.initData || tgWebApp?.initData || '';

  const headers = tgInitData ? { 'X-Telegram-Init-Data': tgInitData } : {};
  const main = document.getElementById('app');
  let activeTerminal = null;
  let activeSocket = null;

  function api(url, opts) {
    const h = { ...headers, ...opts?.headers };
    return fetch(url, { ...opts, headers: h }).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || r.statusText || 'Request failed');
      }
      return r.json().then(function (body) {
        if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
          return body.data;
        }
        return body;
      });
    });
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function jsStr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  function showError(msg) {
    main.innerHTML = '<div class="error">' + esc(msg) + '</div>';
  }

  function showLoading() {
    main.innerHTML = '<div class="loading">Loading...</div>';
  }

  function showConfirm(msg, onYes) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal"><p>' + esc(msg) + '</p>'
      + '<div class="actions"><button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn primary" id="confirm-yes">Yes</button></div></div>';
    document.body.appendChild(overlay);
    document.getElementById('confirm-yes').onclick = function () {
      overlay.remove();
      onYes();
    };
  }

  function renderNav(activeRoute) {
    document.querySelectorAll('.nav-link').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === activeRoute);
    });
    const navUser = document.getElementById('navUser');
    if (state.userName) navUser.textContent = state.userName;
  }

  // ─── Router ──────────────────────────────────────────────────────

  function parseRoute(hash) {
    const h = hash.replace(/^#/, '') || 'dashboard';
    const parts = h.split('/');
    return { screen: parts[0], id: parts[1] || null, extra: parts[2] || null };
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  window.addEventListener('hashchange', renderRoute);

  function renderRoute() {
    try {
      const route = parseRoute(window.location.hash);
      renderNav(route.screen);
      switch (route.screen) {
        case 'dashboard': renderDashboard(); break;
        case 'workspaces': renderWorkspaceList(); break;
        case 'workspace': renderWorkspaceSettings(route.id); break;
        case 'project': renderProjectDetail(route.id); break;
        case 'session': renderTerminal(route.id); break;
        case 'git': renderGitOps(route.id); break;
        case 'sessions': renderSessionList(); break;
        default: renderDashboard();
      }
    } catch (e) {
      main.innerHTML = '<div class="error">Render error: ' + esc(e.message || e) + '</div>';
    }
  }

  // ─── Dashboard ───────────────────────────────────────────────────

  function renderDashboard() {
    const ws = state.workspaces?.find((w) => w.active);
    const sess = state.activeSession;

    let html = '<h1>Dashboard</h1>';
    if (ws) {
      html += '<div class="card"><h3>Active Workspace</h3>';
      html += '<div class="card-row"><span class="label">Name</span><span class="value">' + esc(ws.name) + '</span></div>';
      html += '<div class="card-row"><span class="label">Provider</span><span class="value">' + esc(ws.providerId || 'Not configured') + '</span></div>';
      html += '<div class="card-row"><span class="label">Model</span><span class="value">' + esc(ws.model || 'Not selected') + '</span></div>';
      html += '<div class="card-row"><span class="label">Projects</span><span class="value">' + ws.projectCount + '</span></div>';
      html += '<div class="card-row"><span class="label">Git</span><span class="value">' + (ws.hasGitToken ? 'Configured' : 'Not configured') + '</span></div>';
      html += '<div class="actions">';
      html += '<button class="btn" onclick="location.hash=\'#workspace/' + ws.id + '\'">&#9881; Settings</button>';
      html += '<button class="btn" onclick="location.hash=\'#git/' + ws.id + '\'">&#128196; Git</button>';
      html += '</div></div>';
    } else {
      html += '<div class="card"><p>No active workspace. <a href="#workspaces">Create or switch</a>.</p></div>';
    }

    if (sess) {
      html += '<div class="card"><h3>Active Session</h3>';
      html += '<div class="card-row"><span class="label">ID</span><span class="value">' + esc(sess.publicId) + '</span></div>';
      html += '<div class="card-row"><span class="label">Status</span><span class="value"><span class="badge ' + (sess.running ? 'badge-green' : 'badge-red') + '">' + (sess.running ? 'Running' : 'Stopped') + '</span></span></div>';
      html += '<div class="card-row"><span class="label">Prompt</span><span class="value">' + esc(sess.prompt) + '</span></div>';
      html += '<div class="actions">';
      html += '<button class="btn primary" onclick="location.hash=\'#session/' + sess.id + '\'">&#9000; Open Terminal</button>';
      html += '</div></div>';
    } else {
      html += '<div class="card"><h3>New Session</h3><p>Send a prompt to start a session.</p>';
      html += '<div class="form-group"><label>Prompt</label>';
      html += '<input type="text" id="prompt-input" placeholder="e.g. Fix the login bug"';
      html += ' onkeydown="if(event.key===\'Enter\')startSession(this.value)"></div>';
      html += '<button class="btn primary" onclick="startSession(document.getElementById(\'prompt-input\').value)">&#9654; Start</button>';
      html += '</div>';
    }

    if (!sess && ws) {
      html += '<div class="card"><h3>Quick Links</h3>';
      html += '<div class="actions">';
      html += '<button class="btn" onclick="location.hash=\'#workspaces\'">&#128451; All Workspaces</button>';
      html += '<button class="btn" onclick="location.hash=\'#sessions\'">&#128195; All Sessions</button>';
      html += '</div></div>';
    }

    main.innerHTML = html;
  }

  window.startSession = function (prompt) {
    if (!prompt) return;
    showLoading();
    api('/api/sessions', { method: 'POST', body: JSON.stringify({ prompt }), headers: { 'Content-Type': 'application/json', ...headers } })
      .then((s) => { navigate('#session/' + s.id); })
      .catch((e) => { showError(e.message); });
  };

  // ─── Workspace List ──────────────────────────────────────────────

  function renderWorkspaceList() {
    showLoading();
    api('/api/workspaces').then((workspaces) => {
      if (!Array.isArray(workspaces)) workspaces = [];
      let html = '<h1>Workspaces</h1>';
      html += '<div class="card">';
      if (workspaces.length === 0) {
        html += '<p>No workspaces yet.</p>';
      } else {
        for (const w of workspaces) {
          const badges = [];
          if (w.active) badges.push('<span class="badge badge-green">active</span>');
          if (w.providerId) badges.push('<span class="badge badge-blue">' + esc(w.providerId) + '</span>');
          html += '<div class="ws-list-item" onclick="location.hash=\'#workspace/' + w.id + '\'">';
          html += '<div class="info"><div class="name">' + esc(w.name) + ' ' + badges.join('') + '</div>';
          html += '<div class="meta">Model: ' + esc(w.model || '—') + ' &middot; Projects: ' + w.projectCount + ' &middot; Sessions: ' + w.sessionCount + '</div>';
          html += '</div></div>';
        }
      }
      html += '</div>';
      main.innerHTML = html;
    }).catch((e) => { showError(e.message); });
  }

  // ─── Workspace Settings ──────────────────────────────────────────

  function renderWorkspaceSettings(id) {
    showLoading();
    Promise.all([
      api('/api/workspaces/' + id),
      api('/api/git/' + id + '/credentials').catch(() => ({ isSet: false })),
    ]).then(([ws, gitStatus]) => {
      let html = '<h1>' + esc(ws.name) + '</h1>';
      html += '<div class="actions"><button class="btn" onclick="location.hash=\'#workspaces\'">&#8592; Back</button>';
      html += '<button class="btn ' + (ws.active ? '' : 'primary') + '" onclick="activateWorkspace(\'' + id + '\')">' + (ws.active ? 'Active' : 'Set Active') + '</button></div>';

      html += '<div class="card"><h3>Provider & Model</h3>';
      html += '<div class="form-group"><label>Provider</label>';
      html += '<select id="provider-select" onchange="onProviderChange(\'' + id + '\')">';
      for (const p of ['', 'opencode', 'openai', 'anthropic', 'github-copilot']) {
        html += '<option value="' + p + '"' + (ws.providerId === p ? ' selected' : '') + '>' + (p || 'None') + '</option>';
      }
      html += '</select></div>';
      html += '<div class="form-group" id="apikey-group" style="display:' + (ws.providerId ? 'block' : 'none') + '"><label>API Key</label>';
      html += '<input type="password" id="apikey-input" placeholder="Enter API key" value="' + esc(ws.apiKey || '') + '"></div>';
      html += '<button class="btn primary" onclick="saveProvider(\'' + id + '\')">Save Provider</button>';

      html += '<div class="form-group mt-8"><label>Model</label>';
      html += '<select id="model-select"><option value="">Loading models...</option></select></div>';
      html += '<button class="btn primary" onclick="saveModel(\'' + id + '\')">Save Model</button></div>';

      html += '<div class="card"><h3>Projects</h3>';
      if (ws.projects?.length) {
        for (const p of ws.projects) {
          html += '<div class="ws-list-item" onclick="location.hash=\'#project/' + p.id + '\'">';
          html += '<div class="info"><div class="name">' + esc(p.name) + '</div>';
          html += '<div class="meta">' + esc(p.path || '.') + (p.gitPath ? ' &middot; ' + esc(p.branch || 'main') : '') + '</div>';
          html += '</div></div>';
        }
      } else {
        html += '<p>No projects.</p>';
      }
      html += '<div class="actions"><button class="btn" onclick="showAddProjectModal(\'' + id + '\')">+ Add Project</button></div></div>';

      html += '<div class="card"><h3>Git Credentials</h3>';
      if (gitStatus.isSet) {
        html += '<div class="card-row"><span class="label">Status</span><span class="value">Logged in as ' + esc(gitStatus.username || '') + '</span></div>';
        html += '<div class="card-row"><span class="label">Token</span><span class="value">' + esc(gitStatus.tokenMasked || '') + '</span></div>';
        html += '<div class="actions"><button class="btn danger" onclick="logoutGit(\'' + id + '\')">Logout</button></div>';
      } else {
        html += '<p>Not configured.</p>';
        html += '<div class="form-group mt-8"><label>Username</label><input type="text" id="git-user" placeholder="Git username"></div>';
        html += '<div class="form-group"><label>Token</label><input type="password" id="git-token" placeholder="Personal access token"></div>';
        html += '<div class="form-group"><label>Remote URL</label><input type="text" id="git-url" placeholder="https://github.com/org/repo.git"></div>';
        html += '<button class="btn primary" onclick="saveGitCredentials(\'' + id + '\')">Save Credentials</button>';
      }
      html += '</div>';

      main.innerHTML = html;

      if (ws.providerId) {
        loadModels(id);
      }
    }).catch((e) => { showError(e.message); });
  }

  window.onProviderChange = function () {
    document.getElementById('apikey-group').style.display = 'block';
  };

  window.saveProvider = function (id) {
    const providerId = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('apikey-input').value;
    if (!providerId) return;
    showLoading();
    api('/api/workspaces/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ providerId, apiKey }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then(() => { renderWorkspaceSettings(id); }).catch((e) => { showError(e.message); });
  };

  window.saveModel = function (id) {
    const model = document.getElementById('model-select').value;
    if (!model) return;
    showLoading();
    api('/api/workspaces/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ model }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then(() => { renderWorkspaceSettings(id); }).catch((e) => { showError(e.message); });
  };

  function loadModels(id) {
    var sel = document.getElementById('model-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading models...</option>';
    api('/api/workspaces/' + id + '/models').then((models) => {
      if (!Array.isArray(models)) models = [];
      sel = document.getElementById('model-select');
      if (!sel) return;
      var currentModel = state.workspaces ? state.workspaces.find(function (w) { return w.id === id; }) : null;
      sel.innerHTML = '<option value="">Select model...</option>';
      if (models.length === 0) {
        sel.innerHTML = '<option value="">No models available</option>';
        return;
      }
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        sel.innerHTML += '<option value="' + esc(m) + '"' + (currentModel && currentModel.model === m ? ' selected' : '') + '>' + esc(m) + '</option>';
      }
    }).catch(function () {
      sel = document.getElementById('model-select');
      if (sel) sel.innerHTML = '<option value="">Failed to load models</option>';
    });
  }

  window.activateWorkspace = function (id) {
    api('/api/workspaces/' + id + '/activate', { method: 'POST' }).then(() => {
      state.workspaces = state.workspaces.map((w) => ({ ...w, active: w.id === id }));
      renderWorkspaceSettings(id);
    }).catch((e) => { showError(e.message); });
  };

  window.showAddProjectModal = function (wsId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal"><h3>Add Project</h3>'
      + '<div class="form-group"><label>Name</label><input type="text" id="proj-name" placeholder="backend"></div>'
      + '<div class="form-group"><label>Path (relative)</label><input type="text" id="proj-path" placeholder="."></div>'
      + '<div class="form-group"><label>Remote URL (optional)</label><input type="text" id="proj-url" placeholder="https://github.com/org/repo.git"></div>'
      + '<div class="actions"><button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn primary" onclick="addProject(\'' + wsId + '\', this)">Add</button></div></div>';
    document.body.appendChild(overlay);
  };

  window.addProject = function (wsId, btn) {
    const name = document.getElementById('proj-name').value;
    const path = document.getElementById('proj-path').value;
    const remoteUrl = document.getElementById('proj-url').value || undefined;
    if (!name || !path) return;
    btn.textContent = 'Adding...';
    api('/api/workspaces/' + wsId + '/projects', {
      method: 'POST',
      body: JSON.stringify({ name, path, remoteUrl }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then(() => {
      btn.closest('.modal-overlay').remove();
      renderWorkspaceSettings(wsId);
    }).catch((e) => { showError(e.message); });
  };

  window.saveGitCredentials = function (id) {
    const username = document.getElementById('git-user').value;
    const token = document.getElementById('git-token').value;
    const remoteUrl = document.getElementById('git-url').value || undefined;
    if (!username || !token) return;
    showLoading();
    api('/api/git/' + id + '/credentials', {
      method: 'POST',
      body: JSON.stringify({ username, token, remoteUrl }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then((r) => {
      if (r.valid === false) { showError(r.error); return; }
      renderWorkspaceSettings(id);
    }).catch((e) => { showError(e.message); });
  };

  window.logoutGit = function (id) {
    showLoading();
    api('/api/git/' + id + '/credentials', { method: 'DELETE' }).then(() => {
      renderWorkspaceSettings(id);
    }).catch((e) => { showError(e.message); });
  };

  // ─── Project Detail ──────────────────────────────────────────────

  function renderProjectDetail(id) {
    showLoading();
    api('/api/workspaces').then((workspaces) => {
      if (!Array.isArray(workspaces)) workspaces = [];
      let found = null;
      let wsId = '';
      for (const w of workspaces) {
        for (const p of (w.projects || [])) {
          if (p.id === id) { found = p; wsId = w.id; break; }
        }
        if (found) break;
      }
      if (!found) { showError('Project not found'); return; }

      return Promise.all([
        api('/api/git/' + wsId + '/status?projectId=' + id),
        api('/api/git/' + wsId + '/branches?projectId=' + id),
      ]).then(([status, branches]) => {
        renderProjectHTML(wsId, found, status, branches);
      });
    }).catch((e) => { showError(e.message); });
  }

  function renderProjectHTML(wsId, proj, status, branches) {
    let html = '<h1>' + esc(proj.name) + '</h1>';
    html += '<div class="actions"><button class="btn" onclick="location.hash=\'#workspace/' + wsId + '\'">&#8592; Back</button></div>';

    html += '<div class="card"><h3>Status</h3>';
    html += '<div class="card-row"><span class="label">Branch</span><span class="value">' + esc(status.branch || '—') + '</span></div>';
    html += '<div class="card-row"><span class="label">Status</span><span class="value"><span class="badge ' + (status.clean ? 'badge-green' : 'badge-red') + '">' + (status.clean ? 'Clean' : 'Dirty') + '</span></span></div>';
    if (status.files?.length) {
      html += '<div class="card-row"><span class="label">Changed Files</span><span class="value">' + esc(status.files.join(', ').slice(0, 200)) + '</span></div>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Actions</h3><div class="grid-2">';
    html += '<button class="btn" onclick="gitDiff(\'' + wsId + '\',\'' + proj.id + '\')">&#128221; Diff</button>';
    html += '<button class="btn" onclick="gitStatus(\'' + wsId + '\',\'' + proj.id + '\')">&#128200; Status</button>';
    html += '<button class="btn primary" onclick="showCommitModal(\'' + wsId + '\',\'' + proj.id + '\')">&#128190; Commit</button>';
    html += '<button class="btn" onclick="gitAction(\'' + wsId + '\',\'' + proj.id + '\',\'push\')">&#128640; Push</button>';
    html += '<button class="btn" onclick="gitAction(\'' + wsId + '\',\'' + proj.id + '\',\'pull\')">&#128229; Pull</button>';
    html += '<button class="btn" onclick="gitLog(\'' + wsId + '\',\'' + proj.id + '\')">&#128214; Log</button>';
    html += '</div></div>';

    html += '<div class="card"><h3>Branches</h3>';
    if (branches.branches?.length) {
      for (const b of branches.branches) {
        const isCurrent = b === branches.current;
        html += '<div class="card-row"><span class="value">' + (isCurrent ? '&#128073; ' : '') + esc(b) + '</span>';
        if (!isCurrent) {
          html += '<button class="btn" onclick="gitCheckout(\'' + jsStr(wsId) + '\',\'' + jsStr(proj.id) + '\',\'' + jsStr(b) + '\')">Switch</button>';
        }
        html += '</div>';
      }
    }
    html += '</div>';

    html += '<div id="git-output"></div>';
    main.innerHTML = html;
  }

  window.gitDiff = function (wsId, projId) {
    api('/api/git/' + wsId + '/diff?projectId=' + projId).then((r) => {
      const out = document.getElementById('git-output');
      if (!out) return;
      out.innerHTML = '<div class="card"><h3>Diff</h3><pre style="font-size:12px;overflow-x:auto;white-space:pre-wrap;background:#0d1117;padding:12px;border-radius:6px;border:1px solid #30363d;">' + esc(r.diff || '(no changes)') + '</pre></div>';
    }).catch((e) => { showError(e.message); });
  };

  window.gitStatus = function (wsId, projId) {
    api('/api/git/' + wsId + '/status?projectId=' + projId).then((r) => {
      const out = document.getElementById('git-output');
      if (!out) return;
      let html = '<div class="card"><h3>Status</h3>';
      html += '<div class="card-row"><span class="label">Branch</span><span class="value">' + esc(r.branch) + '</span></div>';
      html += '<div class="card-row"><span class="label">Clean</span><span class="value">' + (r.clean ? 'Yes' : 'No') + '</span></div>';
      if (r.files?.length) html += '<div class="card-row"><span class="label">Files</span><span class="value">' + esc(r.files.join('\n')) + '</span></div>';
      html += '</div>';
      out.innerHTML = html;
    }).catch((e) => { showError(e.message); });
  };

  window.showCommitModal = function (wsId, projId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal"><h3>Commit Changes</h3>'
      + '<div class="form-group"><label>Message</label><input type="text" id="commit-msg" placeholder="Describe your changes"></div>'
      + '<div class="actions"><button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>'
      + '<button class="btn primary" onclick="gitCommit(\'' + wsId + '\',\'' + projId + '\',this)">Commit</button></div></div>';
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('commit-msg')?.focus(), 100);
  };

  window.gitCommit = function (wsId, projId, btn) {
    const msg = document.getElementById('commit-msg').value;
    if (!msg) return;
    btn.textContent = 'Committing...';
    api('/api/git/' + wsId + '/commit', {
      method: 'POST',
      body: JSON.stringify({ message: msg, projectId: projId }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then((r) => {
      btn.closest('.modal-overlay').remove();
      const out = document.getElementById('git-output');
      if (out) out.innerHTML = '<div class="success">Committed: ' + esc(r.sha || '') + '</div>';
    }).catch((e) => { showError(e.message); });
  };

  window.gitAction = function (wsId, projId, action) {
    api('/api/git/' + wsId + '/' + action, {
      method: 'POST',
      body: JSON.stringify({ projectId: projId }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }).then((r) => {
      const out = document.getElementById('git-output');
      if (out) out.innerHTML = '<div class="success">' + esc(action) + ' completed</div>';
    }).catch((e) => { showError(e.message); });
  };

  window.gitLog = function (wsId, projId) {
    api('/api/git/' + wsId + '/log?projectId=' + projId + '&limit=10').then((r) => {
      const out = document.getElementById('git-output');
      if (!out) return;
      let html = '<div class="card"><h3>Recent Commits</h3>';
      if (r.commits?.length) {
        for (const c of r.commits) {
          html += '<div class="card-row"><span class="value"><code>' + esc(c.sha?.slice(0, 7)) + '</code> ' + esc(c.message?.split('\n')[0]) + ' <span style="color:#8b949e">by ' + esc(c.author || '') + '</span></span></div>';
        }
      } else {
        html += '<p>No commits.</p>';
      }
      html += '</div>';
      out.innerHTML = html;
    }).catch((e) => { showError(e.message); });
  };

  window.gitCheckout = function (wsId, projId, branch) {
    showConfirm('Switch to "' + branch + '"?', function () {
      api('/api/git/' + wsId + '/checkout', {
        method: 'POST',
        body: JSON.stringify({ branch, projectId: projId, onDirty: 'stash' }),
        headers: { 'Content-Type': 'application/json', ...headers },
      }).then((r) => {
        const out = document.getElementById('git-output');
        if (out) out.innerHTML = '<div class="success">Switched to ' + esc(r.branch) + '</div>';
        renderProjectDetail(projId);
      }).catch((e) => { showError(e.message); });
    });
  };

  // ─── Terminal ────────────────────────────────────────────────────

  function renderTerminal(sessionId) {
    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    let html = '<div class="actions"><button class="btn" onclick="disconnectTerminal();location.hash=\'#dashboard\'">&#8592; Back</button></div>';
    html += '<div class="card" id="terminal-card"><h3>Session Terminal</h3>';
    html += '<div id="terminal-container"></div>';
    html += '<div class="terminal-controls" id="terminal-controls">';
    html += '<button class="btn" onclick="terminalKey(\'tab\')">Tab</button>';
    html += '<button class="btn" onclick="terminalKey(\'enter\')">Enter</button>';
    html += '<button class="btn" onclick="terminalKey(\'up\')">&#8593;</button>';
    html += '<button class="btn" onclick="terminalKey(\'down\')">&#8595;</button>';
    html += '<button class="btn danger" onclick="terminalKey(\'ctrl+c\')">Ctrl+C</button>';
    html += '</div></div>';
    html += '<div id="terminal-status"></div>';

    main.innerHTML = html;

    try {
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff' },
        cols: 80,
        rows: 24,
      });
      activeTerminal = term;
      term.open(document.getElementById('terminal-container'));

      term.onData(function (data) {
        if (activeSocket && activeSocket.connected) {
          activeSocket.emit('terminal:input', { data });
        }
      });

      const socketUrl = protocol + '//' + host + '/gateway';
      const socket = io(socketUrl, {
        query: { initData: tgInitData, session: sessionId },
        transports: ['websocket', 'polling'],
      });
      activeSocket = socket;

      socket.on('connect', function () {
        document.getElementById('terminal-status').innerHTML = '<div class="success">Connected</div>';
      });

      socket.on('terminal:data', function (data) {
        try { term.write(data); } catch (e) { /* ignore */ }
      });

      socket.on('terminal:exit', function (data) {
        document.getElementById('terminal-status').innerHTML = '<div class="card-row"><span class="label">Session ended</span><span class="value">Exit code: ' + (data.code ?? '—') + ' (' + Math.round((data.durationMs || 0) / 1000) + 's)</span></div>';
        document.getElementById('terminal-controls').innerHTML = '<button class="btn" onclick="location.hash=\'#dashboard\'">&#8592; Back</button>';
      });

      socket.on('error', function (err) {
        document.getElementById('terminal-status').innerHTML = '<div class="error">' + esc(typeof err === 'string' ? err : err.message || 'Connection error') + '</div>';
      });

      socket.on('disconnect', function () {
        document.getElementById('terminal-status').innerHTML = '<div class="error">Disconnected</div>';
      });
    } catch (e) {
      document.getElementById('terminal-container').innerHTML = '<div class="error">Failed to initialize terminal: ' + esc(e.message) + '</div>';
    }
  }

  window.disconnectTerminal = function () {
    if (activeSocket) { activeSocket.disconnect(); activeSocket = null; }
    if (activeTerminal) { try { activeTerminal.dispose(); } catch (e) { /* ignore */ } activeTerminal = null; }
  };

  window.terminalKey = function (key) {
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('terminal:input', { type: 'key', data: key });
    }
  };

  // ─── Git Operations ──────────────────────────────────────────────

  function renderGitOps(wsId) {
    showLoading();
    api('/api/git/' + wsId + '/credentials').then((status) => {
      let html = '<h1>Git Operations</h1>';
      html += '<div class="actions"><button class="btn" onclick="location.hash=\'#workspace/' + wsId + '\'">&#8592; Back</button></div>';

      html += '<div class="card"><h3>Credentials</h3>';
      if (status.isSet) {
        html += '<div class="card-row"><span class="label">Status</span><span class="value"><span class="badge badge-green">Logged In</span></span></div>';
        html += '<div class="card-row"><span class="label">Username</span><span class="value">' + esc(status.username || '') + '</span></div>';
        html += '<div class="card-row"><span class="label">Token</span><span class="value">' + esc(status.tokenMasked || '') + '</span></div>';
        html += '<div class="actions">';
        html += '<button class="btn" onclick="testGitCredentials(\'' + wsId + '\')">Test</button>';
        html += '<button class="btn danger" onclick="logoutGit(\'' + wsId + '\')">Logout</button>';
        html += '</div>';
      } else {
        html += '<p>Not configured.</p>';
        html += '<div class="form-group mt-8"><label>Username</label><input type="text" id="git-user" placeholder="Git username"></div>';
        html += '<div class="form-group"><label>Token</label><input type="password" id="git-token" placeholder="Personal access token"></div>';
        html += '<div class="form-group"><label>Remote URL</label><input type="text" id="git-url" placeholder="https://github.com/org/repo.git"></div>';
        html += '<button class="btn primary" onclick="saveGitCredentials(\'' + wsId + '\')">Save &amp; Validate</button>';
      }
      html += '</div>';

      html += '<div class="card"><h3>Git Commands</h3>';
      html += '<p>Navigate to a project to run git commands.</p>';
      html += '<div class="actions">';
      html += '<button class="btn" onclick="location.hash=\'#workspace/' + wsId + '\'">View Projects</button>';
      html += '</div></div>';

      html += '<div id="git-output"></div>';
      main.innerHTML = html;
    }).catch((e) => { showError(e.message); });
  }

  window.testGitCredentials = function (wsId) {
    const out = document.getElementById('git-output');
    if (out) out.innerHTML = '<div class="loading">Testing...</div>';
    api('/api/git/' + wsId + '/credentials', { method: 'GET' }).then((status) => {
      if (out) {
        if (status.isSet) {
          out.innerHTML = '<div class="success">Credentials are set for ' + esc(status.username || '') + '</div>';
        } else {
          out.innerHTML = '<div class="error">No credentials set</div>';
        }
      }
    }).catch((e) => {
      if (out) out.innerHTML = '<div class="error">' + esc(e.message) + '</div>';
    });
  };

  // ─── Session List ────────────────────────────────────────────────

  function renderSessionList() {
    showLoading();
    api('/api/sessions').then((sessions) => {
      if (!Array.isArray(sessions)) sessions = [];
      let html = '<h1>Sessions</h1><div class="card">';
      if (sessions.length === 0) {
        html += '<p>No sessions. Start one from the Dashboard.</p>';
      } else {
        for (const s of sessions) {
          html += '<div class="session-item">';
          html += '<div class="info"><div class="id">' + esc(s.publicId || s.id) + ' <span class="badge ' + (s.running ? 'badge-green' : 'badge-red') + '">' + (s.running ? 'Running' : 'Stopped') + '</span></div>';
          html += '<div class="prompt">' + esc((s.prompt || '').slice(0, 80)) + '</div>';
          html += '<div style="font-size:11px;color:#8b949e">' + esc(s.workspaceName || '') + '</div></div>';
          html += '<div class="actions" style="flex:0 0 auto">';
          if (s.running) html += '<button class="btn" onclick="location.hash=\'#session/' + jsStr(s.id) + '\'">&#9000; Terminal</button>';
          html += '<button class="btn danger" onclick="cancelSession(\'' + jsStr(s.id) + '\',this)">&#10005;</button>';
          html += '</div></div>';
        }
      }
      html += '</div>';
      main.innerHTML = html;
    }).catch((e) => { showError(e.message); });
  }

  window.cancelSession = function (id, btn) {
    btn.textContent = '...';
    api('/api/sessions/' + id + '/cancel', { method: 'POST' }).then(() => {
      renderSessionList();
    }).catch((e) => { showError(e.message); });
  };

  // ─── Init ────────────────────────────────────────────────────────

  renderRoute();

  if (state.session) {
    navigate('#session/' + state.session);
  }
})();
