(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Telegram WebApp Setup
  // ═══════════════════════════════════════════════════════════════════════════

  var tg = window.Telegram && window.Telegram.WebApp;
  var state = window.__INITIAL_STATE__ || {};
  var tgInitData = state.initData || (tg && tg.initData) || '';
  var headers = tgInitData ? { 'X-Telegram-Init-Data': tgInitData } : {};

  if (tg) {
    tg.ready();
    tg.expand();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DOM Refs & State
  // ═══════════════════════════════════════════════════════════════════════════

  var main = document.getElementById('app');
  var activeTerminal = null;
  var activeSocket = null;
  var toastTimer = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Core API Helpers (MUST REMAIN IDENTICAL)
  // ═══════════════════════════════════════════════════════════════════════════

  function api(url, opts) {
    var h = Object.assign({}, headers, opts && opts.headers);
    return fetch(url, Object.assign({}, opts, { headers: h })).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.message || r.statusText || 'Request failed');
        });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Telegram Haptic & Navigation Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  function haptic(style) {
    if (tg && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style || 'medium');
    }
  }

  function updateBackButton(show) {
    if (!tg) return;
    if (show) {
      tg.BackButton.onClick(function () {
        window.history.back();
      });
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }

  function updateMainButton(config) {
    if (!tg) return;
    if (!config) {
      tg.MainButton.hide();
      tg.MainButton.hideProgress();
      return;
    }
    tg.MainButton.setText(config.text || 'Action');
    tg.MainButton.onClick(config.callback || function () {});
    if (config.color) tg.MainButton.color = config.color;
    if (config.textColor) tg.MainButton.textColor = config.textColor;
    if (config.progress) tg.MainButton.showProgress();
    tg.MainButton.show();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Toast Notification System
  // ═══════════════════════════════════════════════════════════════════════════

  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;

    var container = document.getElementById('toast-container');
    if (!container) return;

    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<span class="toast-dot"></span>'
      + '<span class="toast-body">' + esc(message) + '</span>'
      + '<button class="toast-dismiss" onclick="this.parentElement.classList.remove(\'toast-visible\');setTimeout(function(){this.parentElement.remove()}.bind(this),400)" aria-label="Dismiss">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>';

    container.appendChild(el);

    // Trigger enter animation
    requestAnimationFrame(function () {
      el.classList.add('toast-visible');
    });

    // Auto-dismiss
    var timer = setTimeout(function () {
      el.classList.remove('toast-visible');
      setTimeout(function () {
        if (el.parentNode) el.remove();
      }, 400);
    }, duration);

    // Store timer reference for cleanup
    el._timer = timer;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Skeleton Loading Screens
  // ═══════════════════════════════════════════════════════════════════════════

  function createSkeleton(type) {
    type = type || 'default';

    var generic = ''
      + '<div class="skel skel-h1"></div>'
      + '<div class="skel-card">'
      + '  <div class="skel skel-h3"></div>'
      + '  <div class="skel skel-line skel-w-100"></div>'
      + '  <div class="skel skel-line skel-w-80"></div>'
      + '  <div class="skel skel-line skel-w-65"></div>'
      + '  <div class="skel skel-line skel-w-40"></div>'
      + '</div>'
      + '<div class="skel-card">'
      + '  <div class="skel skel-h3"></div>'
      + '  <div class="skel skel-line skel-w-90"></div>'
      + '  <div class="skel skel-line skel-w-70"></div>'
      + '  <div class="skel skel-btn"></div>'
      + '</div>';

    if (type === 'dashboard') {
      return ''
        + '<div class="skel skel-h1"></div>'
        + '<div class="skel-card">'
        + '  <div class="skel skel-h3"></div>'
        + '  <div class="skel skel-line skel-w-100"></div>'
        + '  <div class="skel skel-line skel-w-80"></div>'
        + '  <div class="skel skel-line skel-w-50"></div>'
        + '</div>'
        + '<div class="skel-card">'
        + '  <div class="skel skel-h3"></div>'
        + '  <div class="skel skel-line skel-w-90"></div>'
        + '  <div class="skel skel-line skel-w-65"></div>'
        + '  <div class="skel skel-btn"></div>'
        + '</div>';
    }

    if (type === 'list') {
      var items = '';
      for (var i = 0; i < 4; i++) {
        items += ''
          + '<div class="skel-row">'
          + '  <div class="flex-1">'
          + '    <div class="skel skel-line skel-w-65"></div>'
          + '    <div class="skel skel-line skel-w-40" style="margin-top:8px"></div>'
          + '  </div>'
          + '</div>';
      }
      return '<div class="skel skel-h1"></div><div class="skel-card">' + items + '</div>';
    }

    if (type === 'detail') {
      return ''
        + '<div style="display:flex;gap:12px;margin-bottom:20px">'
        + '  <div class="skel" style="height:36px;width:80px"></div>'
        + '  <div class="skel" style="height:36px;flex:1"></div>'
        + '</div>'
        + '<div class="skel-card">'
        + '  <div class="skel skel-h3"></div>'
        + '  <div class="skel skel-line skel-w-100"></div>'
        + '  <div class="skel skel-line skel-w-80"></div>'
        + '  <div class="skel skel-line skel-w-60"></div>'
        + '</div>'
        + '<div class="skel-card">'
        + '  <div class="skel skel-h3"></div>'
        + '  <div class="skel skel-line skel-w-90"></div>'
        + '  <div class="skel skel-line skel-w-70"></div>'
        + '</div>'
        + '<div class="skel-card">'
        + '  <div class="skel skel-h3"></div>'
        + '  <div class="skel skel-line skel-w-85"></div>'
        + '</div>';
    }

    return generic;
  }

  function showLoading(skeletonType) {
    main.innerHTML = '<div class="anim-fade-in">' + createSkeleton(skeletonType) + '</div>';
  }

  function showError(msg) {
    // Use inline error with toast
    main.innerHTML = ''
      + '<div class="error-state anim-fade-in">'
      + '  <div class="error-state-icon">&#9888;</div>'
      + '  <div class="error-state-title">Something went wrong</div>'
      + '  <div class="error-state-desc">' + esc(msg) + '</div>'
      + '  <button class="btn btn-primary" onclick="window.location.reload()">Try Again</button>'
      + '</div>';
    showToast(msg, 'error', 5000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Page Transition
  // ═══════════════════════════════════════════════════════════════════════════

  function transitionTo(html, cb) {
    main.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    main.style.opacity = '0';
    main.style.transform = 'translateY(8px)';

    setTimeout(function () {
      main.innerHTML = html;
      main.style.transform = 'translateY(0)';
      main.style.opacity = '1';

      if (cb) cb();

      setTimeout(function () {
        main.style.transition = '';
        main.style.transform = '';
      }, 200);
    }, 160);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Bottom Sheet Modal
  // ═══════════════════════════════════════════════════════════════════════════

  function openSheet(title, bodyHtml) {
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = bodyHtml;
    document.getElementById('sheet-overlay').style.display = 'block';
    document.getElementById('bottom-sheet').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(function () {
      document.getElementById('sheet-overlay').classList.add('open');
      document.getElementById('bottom-sheet').classList.add('open');
    });
  }

  window.closeSheet = function () {
    document.getElementById('sheet-overlay').classList.remove('open');
    document.getElementById('bottom-sheet').classList.remove('open');
    document.body.style.overflow = '';

    setTimeout(function () {
      document.getElementById('sheet-overlay').style.display = 'none';
      document.getElementById('bottom-sheet').style.display = 'none';
    }, 350);
  };

  // Close sheet on overlay click
  document.addEventListener('click', function (e) {
    if (e.target.id === 'sheet-overlay') {
      closeSheet();
    }
  });

  // Close sheet on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var sheet = document.getElementById('bottom-sheet');
      if (sheet && sheet.classList.contains('open')) {
        closeSheet();
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Confirmation Modal (kept as DOM creation — matches existing pattern)
  // ═══════════════════════════════════════════════════════════════════════════

  function showConfirm(msg, onYes) {
    haptic('medium');

    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = ''
      + '<div class="confirm-modal anim-fade-in">'
      + '  <p>' + esc(msg) + '</p>'
      + '  <div class="btn-group">'
      + '    <button class="btn btn-ghost" onclick="this.closest(\'.confirm-overlay\').remove()">Cancel</button>'
      + '    <button class="btn btn-primary" id="confirm-yes" style="min-width:80px">Yes</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('confirm-yes').onclick = function () {
      overlay.remove();
      onYes();
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Navigation & Router
  // ═══════════════════════════════════════════════════════════════════════════

  function renderNav(activeRoute) {
    // Top nav
    document.querySelectorAll('.nav-link').forEach(function (el) {
      el.classList.toggle('active', el.dataset.route === activeRoute);
    });
    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.route === activeRoute);
    });
    // User name
    var navUser = document.getElementById('navUser');
    if (state.userName) navUser.textContent = state.userName;
  }

  function parseRoute(hash) {
    var h = hash.replace(/^#/, '') || 'dashboard';
    var parts = h.split('/');
    return { screen: parts[0], id: parts[1] || null, extra: parts[2] || null };
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  window.addEventListener('hashchange', function () {
    // Clear any main button
    updateMainButton(null);
    // Fade out then render
    main.style.transition = 'opacity 0.12s ease';
    main.style.opacity = '0';
    setTimeout(function () {
      renderRoute();
    }, 120);
  });

  function renderRoute() {
    try {
      var route = parseRoute(window.location.hash);
      renderNav(route.screen);

      // Telegram back button
      updateBackButton(route.screen !== 'dashboard');

      // Closing confirmation for active sessions
      if (tg && activeSocket && activeSocket.connected) {
        tg.enableClosingConfirmation();
      } else if (tg) {
        tg.disableClosingConfirmation();
      }

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
      main.innerHTML = '<div class="error-state anim-fade-in"><div class="error-state-title">Render Error</div><div class="error-state-desc">' + esc(e.message || e) + '</div></div>';
      showToast('Failed to render page: ' + (e.message || e), 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  function renderDashboard() {
    var ws = null;
    for (var i = 0; i < (state.workspaces || []).length; i++) {
      if (state.workspaces[i].active) { ws = state.workspaces[i]; break; }
    }
    var sess = state.activeSession;

    var html = '<h1 class="anim-slide-up">Dashboard</h1>';

    // Active Workspace Card
    if (ws) {
      html += '<div class="card card-hoverable anim-slide-up" style="animation-delay:0.05s" onclick="location.hash=\'#workspace/' + ws.id + '\'">'
        + '<div class="card-header"><h3>Active Workspace</h3>' + renderBadge(ws.providerId || 'no provider', ws.providerId ? 'info' : 'neutral') + '</div>'
        + '<div class="card-section"><div class="card-row"><span class="label">Name</span><span class="value">' + esc(ws.name) + '</span></div>'
        + '<div class="card-row"><span class="label">Model</span><span class="value">' + esc(ws.model || 'Not selected') + '</span></div>'
        + '<div class="card-row"><span class="label">Projects</span><span class="value">' + (ws.projectCount || 0) + '</span></div>'
        + '<div class="card-row"><span class="label">Git</span><span class="value">' + (ws.hasGitToken ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-neutral">Not set</span>') + '</span></div>'
        + '</div>'
        + '<div class="btn-group" style="margin-top:var(--space-3)">'
        + '<button class="btn" onclick="event.stopPropagation();location.hash=\'#workspace/' + ws.id + '\'">&#9881; Settings</button>'
        + '<button class="btn" onclick="event.stopPropagation();location.hash=\'#git/' + ws.id + '\'">&#128196; Git</button>'
        + '</div>'
        + '</div>';
    } else {
      html += '<div class="card anim-slide-up" style="animation-delay:0.05s">'
        + '<div class="empty-state" style="padding:var(--space-6) 0">'
        + '<div class="empty-state-icon">&#128451;</div>'
        + '<div class="empty-state-title">No Active Workspace</div>'
        + '<div class="empty-state-desc">Create or switch to a workspace to get started.</div>'
        + '<button class="btn btn-primary" onclick="location.hash=\'#workspaces\'">Go to Workspaces</button>'
        + '</div>'
        + '</div>';
    }

    // Active Session / New Session Card
    if (sess) {
      html += '<div class="card anim-slide-up" style="animation-delay:0.1s">'
        + '<div class="card-header"><h3>Active Session</h3>' + (sess.running ? '<span class="badge badge-success">Running</span>' : '<span class="badge badge-danger">Stopped</span>') + '</div>'
        + '<div class="card-section"><div class="card-row"><span class="label">ID</span><span class="value" style="font-family:var(--font-mono);font-size:13px">' + esc(sess.publicId || sess.id) + '</span></div>'
        + '<div class="card-row"><span class="label">Prompt</span><span class="value">' + esc((sess.prompt || '').slice(0, 100)) + '</span></div>'
        + '</div>'
        + '<button class="btn btn-primary btn-block" onclick="location.hash=\'#session/' + sess.id + '\'">&#9000; Open Terminal</button>'
        + '</div>';
    } else if (ws) {
      html += '<div class="card anim-slide-up" style="animation-delay:0.1s">'
        + '<h3>New Session</h3>'
        + '<p>Send a prompt to start an AI coding session in this workspace.</p>'
        + '<div class="dashboard-prompt">'
        + '  <div class="form-group" style="flex:1;margin-bottom:0">'
        + '    <input type="text" class="form-input" id="prompt-input" placeholder="e.g. Fix the login bug..."'
        + '      onkeydown="if(event.key===\'Enter\'){var v=this.value;if(v){showToast(\'Starting session...\',\'info\');startSession(v)}}">'
        + '  </div>'
        + '  <button class="btn btn-primary btn-icon" onclick="var v=document.getElementById(\'prompt-input\').value;if(v){showToast(\'Starting session...\',\'info\');startSession(v)}" title="Start Session" aria-label="Start Session">'
        + '    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
        + '  </button>'
        + '</div>'
        + '</div>';
    }

    // Quick Links
    html += '<div class="card anim-slide-up" style="animation-delay:0.15s">'
      + '<h3>Quick Links</h3>'
      + '<div class="btn-group">'
      + '<button class="btn btn-ghost" onclick="location.hash=\'#workspaces\'">&#128451; All Workspaces</button>'
      + '<button class="btn btn-ghost" onclick="location.hash=\'#sessions\'">&#128195; All Sessions</button>'
      + '</div>'
      + '</div>';

    html += '<div style="height:var(--space-4)"></div>';

    transitionTo(html);
  }

  window.startSession = function (prompt) {
    if (!prompt) return;
    showLoading('detail');
    api('/api/sessions', { method: 'POST', body: JSON.stringify({ prompt: prompt }), headers: { 'Content-Type': 'application/json' } })
      .then(function (s) {
        haptic('medium');
        navigate('#session/' + s.id);
      })
      .catch(function (e) {
        showError(e.message);
      });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Workspace List
  // ═══════════════════════════════════════════════════════════════════════════

  function renderWorkspaceList() {
    showLoading('list');
    api('/api/workspaces').then(function (workspaces) {
      if (!Array.isArray(workspaces)) workspaces = [];

      var html = '<h1 class="anim-slide-up">Workspaces</h1>'
        + '<button class="btn btn-primary btn-block mb-4 anim-slide-up" style="animation-delay:0.05s" onclick="showCreateWorkspaceModal()">'
        + '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:4px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + '  New Workspace'
        + '</button>'
        + '<div class="card">';

      if (workspaces.length === 0) {
        html += '<div class="empty-state">'
          + '<div class="empty-state-icon">&#128193;</div>'
          + '<div class="empty-state-title">No Workspaces Yet</div>'
          + '<div class="empty-state-desc">Create a workspace to start managing your AI coding projects.</div>'
          + '</div>';
      } else {
        for (var i = 0; i < workspaces.length; i++) {
          var w = workspaces[i];
          var badges = '';
          if (w.active) badges += renderBadge('active', 'success') + ' ';
          if (w.providerId) badges += renderBadge(w.providerId, 'info') + ' ';

          html += '<div class="list-item" onclick="location.hash=\'#workspace/' + w.id + '\'">'
            + '<div class="info">'
            + '<div class="primary">' + esc(w.name) + ' ' + badges + '</div>'
            + '<div class="secondary">Model: ' + esc(w.model || '\u2014') + ' \u00B7 Projects: ' + (w.projectCount || 0) + ' \u00B7 Sessions: ' + (w.sessionCount || 0) + '</div>'
            + '</div>'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tg-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
            + '</div>';
        }
      }

      html += '</div>';
      html += '<div style="height:var(--space-4)"></div>';
      transitionTo(html);
    }).catch(function (e) {
      showError(e.message);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Create Workspace
  // ═══════════════════════════════════════════════════════════════════════════

  window.showCreateWorkspaceModal = function () {
    haptic('medium');
    var bodyHtml = ''
      + '<div class="form-group">'
      + '  <label class="form-label">Workspace Name</label>'
      + '  <input type="text" class="form-input" id="ws-name" placeholder="e.g. my-project" autocomplete="off">'
      + '  <div class="form-error">Name is required</div>'
      + '</div>'
      + '<div class="form-group">'
      + '  <label class="form-label">Work Directory (optional)</label>'
      + '  <input type="text" class="form-input" id="ws-workdir" placeholder="e.g. /home/user/projects" autocomplete="off">'
      + '  <div class="form-hint">Leave empty to use the default workspace directory.</div>'
      + '</div>'
      + '<button class="btn btn-primary btn-block mt-4" onclick="createWorkspace(this)">Create Workspace</button>';

    openSheet('New Workspace', bodyHtml);

    setTimeout(function () {
      var inp = document.getElementById('ws-name');
      if (inp) inp.focus();
    }, 400);
  };

  window.createWorkspace = function (btn) {
    var name = document.getElementById('ws-name').value.trim();
    var workDir = document.getElementById('ws-workdir').value.trim() || undefined;

    if (!name) {
      document.getElementById('ws-name').classList.add('error');
      showToast('Workspace name is required', 'warning');
      return;
    }
    document.getElementById('ws-name').classList.remove('error');

    haptic('medium');
    btn.disabled = true;
    btn.textContent = 'Creating\u2026';

    api('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: name, workDir: workDir }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function (ws) {
      closeSheet();
      showToast('Workspace "' + esc(name) + '" created', 'success');
      navigate('#workspace/' + ws.id);
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = 'Create Workspace';
      showToast(e.message, 'error');
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. Workspace Settings
  // ═══════════════════════════════════════════════════════════════════════════

  function renderWorkspaceSettings(id) {
    showLoading('detail');
    Promise.all([
      api('/api/workspaces/' + id),
      api('/api/git/' + id + '/credentials').catch(function () { return { isSet: false }; }),
    ]).then(function (results) {
      var ws = results[0];
      var gitStatus = results[1];

      var html = '<div class="ws-detail-header anim-slide-up">'
        + '<button class="btn btn-ghost btn-sm" onclick="location.hash=\'#workspaces\'" aria-label="Back">'
        + '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
        + '</button>'
        + '<h1>' + esc(ws.name) + '</h1>'
        + '<button class="btn ' + (ws.active ? 'btn-ghost' : 'btn-primary') + ' btn-sm" onclick="activateWorkspace(\'' + id + '\')">' + (ws.active ? 'Active' : 'Set Active') + '</button>'
        + '</div>';

      // Provider & Model
      html += '<div class="card anim-slide-up" style="animation-delay:0.05s">'
        + '<h3>Provider &amp; Model</h3>';

      html += '<div class="form-group">'
        + '<label class="form-label">Provider</label>'
        + '<select class="form-input" id="provider-select" onchange="onProviderChange(\'' + id + '\')">';
      var providers = ['', 'opencode', 'openai', 'anthropic', 'github-copilot'];
      for (var pi = 0; pi < providers.length; pi++) {
        var pv = providers[pi];
        html += '<option value="' + pv + '"' + (ws.providerId === pv ? ' selected' : '') + '>' + (pv || 'None') + '</option>';
      }
      html += '</select></div>';

      html += '<div class="form-group" id="apikey-group" style="display:' + (ws.providerId ? 'block' : 'none') + '">'
        + '<label class="form-label">API Key</label>'
        + '<input type="password" class="form-input" id="apikey-input" placeholder="Enter API key" value="' + esc(ws.apiKey || '') + '">'
        + '</div>';

      html += '<button class="btn btn-primary btn-block" onclick="saveProvider(\'' + id + '\')">Save Provider</button>';

      html += '<div class="form-group mt-4">'
        + '<label class="form-label">Model</label>'
        + '<select class="form-input" id="model-select"><option value="">Loading models...</option></select>'
        + '</div>';

      html += '<button class="btn btn-primary btn-block" onclick="saveModel(\'' + id + '\')">Save Model</button>'
        + '</div>';

      // Projects
      html += '<div class="card anim-slide-up" style="animation-delay:0.1s">'
        + '<div class="card-header"><h3>Projects</h3><button class="btn btn-sm btn-primary" onclick="showAddProjectModal(\'' + id + '\')">+ Add</button></div>';

      if (ws.projects && ws.projects.length) {
        for (var pj = 0; pj < ws.projects.length; pj++) {
          var p = ws.projects[pj];
          html += '<div class="list-item" onclick="location.hash=\'#project/' + p.id + '\'">'
            + '<div class="info"><div class="primary">' + esc(p.name) + '</div>'
            + '<div class="secondary">' + esc(p.path || '.') + (p.gitPath ? ' \u00B7 ' + esc(p.branch || 'main') : '') + '</div></div>'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tg-hint)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
            + '</div>';
        }
      } else {
        html += '<p style="padding:var(--space-2) 0">No projects yet. Add one to get started.</p>';
      }
      html += '</div>';

      // Git Credentials
      html += '<div class="card anim-slide-up" style="animation-delay:0.15s">'
        + '<h3>Git Credentials</h3>';

      if (gitStatus.isSet) {
        html += '<div class="card-section">'
          + '<div class="card-row"><span class="label">Status</span><span class="value"><span class="badge badge-success">Logged In</span></span></div>'
          + '<div class="card-row"><span class="label">Username</span><span class="value">' + esc(gitStatus.username || '') + '</span></div>'
          + '<div class="card-row"><span class="label">Token</span><span class="value" style="font-family:var(--font-mono);font-size:13px">' + esc(gitStatus.tokenMasked || '') + '</span></div>'
          + '</div>'
          + '<button class="btn btn-danger btn-block" onclick="logoutGit(\'' + id + '\')">Logout Git Credentials</button>';
      } else {
        html += '<p>Not configured. Add your Git credentials to enable version control operations.</p>'
          + '<div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" id="git-user" placeholder="Git username"></div>'
          + '<div class="form-group"><label class="form-label">Token</label><input type="password" class="form-input" id="git-token" placeholder="Personal access token"></div>'
          + '<div class="form-group"><label class="form-label">Remote URL</label><input type="text" class="form-input" id="git-url" placeholder="https://github.com/org/repo.git"></div>'
          + '<button class="btn btn-primary btn-block" onclick="saveGitCredentials(\'' + id + '\')">Save Credentials</button>';
      }
      html += '</div>';

      // Delete Workspace
      html += '<div class="card anim-slide-up" style="animation-delay:0.2s">'
        + '<h3 style="color:var(--tg-danger)">Danger Zone</h3>'
        + '<p>Delete this workspace and all its associated data. This action cannot be undone.</p>'
        + '<button class="btn btn-danger btn-block" onclick="deleteWorkspace(\'' + id + '\',\'' + esc(ws.name) + '\')">Delete Workspace</button>'
        + '</div>';

      html += '<div style="height:var(--space-4)"></div>';
      transitionTo(html, function () {
        if (ws.providerId) {
          loadModels(id);
        }
      });
    }).catch(function (e) {
      showError(e.message);
    });
  }

  window.deleteWorkspace = function (id, name) {
    showConfirm('Delete workspace "' + name + '"? All projects and data will be permanently removed.', function () {
      haptic('medium');
      showLoading('detail');
      api('/api/workspaces/' + id, { method: 'DELETE' }).then(function () {
        showToast('Workspace "' + esc(name) + '" deleted', 'success');
        navigate('#workspaces');
      }).catch(function (e) {
        showError(e.message);
      });
    });
  };

  window.onProviderChange = function () {
    var group = document.getElementById('apikey-group');
    if (group) group.style.display = 'block';
  };

  window.saveProvider = function (id) {
    var providerId = document.getElementById('provider-select').value;
    var apiKey = document.getElementById('apikey-input').value;
    if (!providerId) { showToast('Please select a provider', 'warning'); return; }
    haptic('medium');
    showLoading('detail');
    api('/api/workspaces/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ providerId: providerId, apiKey: apiKey }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      showToast('Provider saved successfully', 'success');
      renderWorkspaceSettings(id);
    }).catch(function (e) {
      showError(e.message);
    });
  };

  window.saveModel = function (id) {
    var model = document.getElementById('model-select').value;
    if (!model) { showToast('Please select a model', 'warning'); return; }
    haptic('medium');
    showLoading('detail');
    api('/api/workspaces/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ model: model }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      showToast('Model saved successfully', 'success');
      renderWorkspaceSettings(id);
    }).catch(function (e) {
      showError(e.message);
    });
  };

  function loadModels(id) {
    var sel = document.getElementById('model-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading models...</option>';
    api('/api/workspaces/' + id + '/models').then(function (models) {
      if (!Array.isArray(models)) models = [];
      sel = document.getElementById('model-select');
      if (!sel) return;
      var currentModel = null;
      if (state.workspaces) {
        for (var i = 0; i < state.workspaces.length; i++) {
          if (state.workspaces[i].id === id) { currentModel = state.workspaces[i].model; break; }
        }
      }
      sel.innerHTML = '<option value="">Select model...</option>';
      if (models.length === 0) {
        sel.innerHTML = '<option value="">No models available</option>';
        return;
      }
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        sel.innerHTML += '<option value="' + esc(m) + '"' + (currentModel === m ? ' selected' : '') + '>' + esc(m) + '</option>';
      }
    }).catch(function () {
      sel = document.getElementById('model-select');
      if (sel) sel.innerHTML = '<option value="">Failed to load models</option>';
    });
  }

  window.activateWorkspace = function (id) {
    haptic('medium');
    api('/api/workspaces/' + id + '/activate', { method: 'POST' }).then(function () {
      state.workspaces = (state.workspaces || []).map(function (w) {
        return Object.assign({}, w, { active: w.id === id });
      });
      showToast('Workspace activated', 'success');
      renderWorkspaceSettings(id);
    }).catch(function (e) {
      showError(e.message);
    });
  };

  window.showAddProjectModal = function (wsId) {
    haptic('medium');
    var bodyHtml = ''
      + '<div class="form-group">'
      + '  <label class="form-label">Project Name</label>'
      + '  <input type="text" class="form-input" id="proj-name" placeholder="e.g. backend" autocomplete="off">'
      + '  <div class="form-error">Name is required</div>'
      + '</div>'
      + '<div class="form-group">'
      + '  <label class="form-label">Path (relative)</label>'
      + '  <input type="text" class="form-input" id="proj-path" placeholder="e.g. ./apps/backend" value="." autocomplete="off">'
      + '  <div class="form-error">Path is required</div>'
      + '</div>'
      + '<div class="form-group">'
      + '  <label class="form-label">Remote URL (optional)</label>'
      + '  <input type="text" class="form-input" id="proj-url" placeholder="https://github.com/org/repo.git" autocomplete="off">'
      + '</div>'
      + '<button class="btn btn-primary btn-block mt-4" onclick="addProject(\'' + wsId + '\', this)">Add Project</button>';

    openSheet('Add Project', bodyHtml);

    // Focus first input
    setTimeout(function () {
      var inp = document.getElementById('proj-name');
      if (inp) inp.focus();
    }, 400);
  };

  window.addProject = function (wsId, btn) {
    var name = document.getElementById('proj-name').value.trim();
    var path = document.getElementById('proj-path').value.trim();
    var remoteUrl = document.getElementById('proj-url').value.trim() || undefined;

    // Validation
    var valid = true;
    if (!name) {
      document.getElementById('proj-name').classList.add('error');
      valid = false;
    } else {
      document.getElementById('proj-name').classList.remove('error');
    }
    if (!path) {
      document.getElementById('proj-path').classList.add('error');
      valid = false;
    } else {
      document.getElementById('proj-path').classList.remove('error');
    }
    if (!valid) return;

    haptic('medium');
    btn.disabled = true;
    btn.textContent = 'Adding\u2026';

    api('/api/workspaces/' + wsId + '/projects', {
      method: 'POST',
      body: JSON.stringify({ name: name, path: path, remoteUrl: remoteUrl }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      closeSheet();
      showToast('Project "' + esc(name) + '" added', 'success');
      renderWorkspaceSettings(wsId);
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = 'Add Project';
      showToast(e.message, 'error');
    });
  };

  window.saveGitCredentials = function (id) {
    var username = document.getElementById('git-user').value.trim();
    var token = document.getElementById('git-token').value.trim();
    var remoteUrl = document.getElementById('git-url').value.trim() || undefined;

    if (!username) { showToast('Username is required', 'warning'); return; }
    if (!token) { showToast('Token is required', 'warning'); return; }

    haptic('medium');
    showLoading('detail');
    api('/api/git/' + id + '/credentials', {
      method: 'POST',
      body: JSON.stringify({ username: username, token: token, remoteUrl: remoteUrl }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function (r) {
      if (r && r.valid === false) {
        showToast(r.error || 'Invalid credentials', 'error');
        renderWorkspaceSettings(id);
        return;
      }
      showToast('Git credentials saved', 'success');
      renderWorkspaceSettings(id);
    }).catch(function (e) {
      showError(e.message);
    });
  };

  window.logoutGit = function (id) {
    showConfirm('Logout from Git?', function () {
      showLoading('detail');
      api('/api/git/' + id + '/credentials', { method: 'DELETE' }).then(function () {
        showToast('Git credentials removed', 'success');
        renderWorkspaceSettings(id);
      }).catch(function (e) {
        showError(e.message);
      });
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. Project Detail
  // ═══════════════════════════════════════════════════════════════════════════

  function renderProjectDetail(id) {
    showLoading('detail');
    api('/api/workspaces').then(function (workspaces) {
      if (!Array.isArray(workspaces)) workspaces = [];
      var found = null;
      var wsId = '';
      for (var wi = 0; wi < workspaces.length; wi++) {
        var w = workspaces[wi];
        if (w.projects) {
          for (var pi = 0; pi < w.projects.length; pi++) {
            if (w.projects[pi].id === id) { found = w.projects[pi]; wsId = w.id; break; }
          }
        }
        if (found) break;
      }
      if (!found) { showError('Project not found'); return; }

      return Promise.all([
        api('/api/git/' + wsId + '/status?projectId=' + id),
        api('/api/git/' + wsId + '/branches?projectId=' + id),
      ]).then(function (results) {
        renderProjectHTML(wsId, found, results[0], results[1]);
      });
    }).catch(function (e) {
      showError(e.message);
    });
  }

  function renderProjectHTML(wsId, proj, status, branches) {
    var html = '<div class="ws-detail-header anim-slide-up">'
      + '<button class="btn btn-ghost btn-sm" onclick="location.hash=\'#workspace/' + wsId + '\'" aria-label="Back">'
      + '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
      + '</button>'
      + '<h1>' + esc(proj.name) + '</h1>'
      + '</div>';

    // Status Card
    html += '<div class="card anim-slide-up" style="animation-delay:0.05s">'
      + '<h3>Status</h3>'
      + '<div class="card-section">'
      + '<div class="card-row"><span class="label">Branch</span><span class="value" style="font-family:var(--font-mono);font-size:13px">' + esc(status.branch || '\u2014') + '</span></div>'
      + '<div class="card-row"><span class="label">Status</span><span class="value">' + (status.clean ? '<span class="badge badge-success">Clean</span>' : '<span class="badge badge-danger">Dirty</span>') + '</span></div>';

    if (status.files && status.files.length) {
      html += '<div class="card-row"><span class="label">Changed Files</span><span class="value" style="font-family:var(--font-mono);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">' + esc(status.files.join(', ').slice(0, 200)) + '</span></div>';
    }
    html += '</div></div>';

    // Actions
    html += '<div class="card anim-slide-up" style="animation-delay:0.1s">'
      + '<h3>Git Actions</h3>'
      + '<div class="grid-2" style="margin-top:var(--space-3)">'
      + '<button class="btn" onclick="gitDiff(\'' + wsId + '\',\'' + proj.id + '\')">&#128221; Diff</button>'
      + '<button class="btn" onclick="gitStatus(\'' + wsId + '\',\'' + proj.id + '\')">&#128200; Status</button>'
      + '<button class="btn btn-primary" onclick="showCommitModal(\'' + wsId + '\',\'' + proj.id + '\')">&#128190; Commit</button>'
      + '<button class="btn" onclick="gitAction(\'' + wsId + '\',\'' + proj.id + '\',\'push\')">&#128640; Push</button>'
      + '<button class="btn" onclick="gitAction(\'' + wsId + '\',\'' + proj.id + '\',\'pull\')">&#128229; Pull</button>'
      + '<button class="btn" onclick="gitLog(\'' + wsId + '\',\'' + proj.id + '\')">&#128214; Log</button>'
      + '</div>'
      + '</div>';

    // Branches
    html += '<div class="card anim-slide-up" style="animation-delay:0.15s">'
      + '<h3>Branches</h3>';
    if (branches.branches && branches.branches.length) {
      for (var bi = 0; bi < branches.branches.length; bi++) {
        var b = branches.branches[bi];
        var isCurrent = b === branches.current;
        html += '<div class="card-row">'
          + '<span class="value" style="font-family:var(--font-mono);font-size:13px">'
          + (isCurrent ? '<span style="color:var(--tg-success)">&#128073;</span> ' : '') + esc(b)
          + '</span>';
        if (!isCurrent) {
          html += '<button class="btn btn-sm" onclick="gitCheckout(\'' + jsStr(wsId) + '\',\'' + jsStr(proj.id) + '\',\'' + jsStr(b) + '\')">Switch</button>';
        } else {
          html += '<span class="badge badge-success">current</span>';
        }
        html += '</div>';
      }
    } else {
      html += '<p>No branches found.</p>';
    }
    html += '</div>';

    // Git output area
    html += '<div id="git-output" class="git-output"></div>';
    html += '<div style="height:var(--space-4)"></div>';

    transitionTo(html);
  }

  window.gitDiff = function (wsId, projId) {
    haptic('medium');
    api('/api/git/' + wsId + '/diff?projectId=' + projId).then(function (r) {
      var out = document.getElementById('git-output');
      if (!out) return;
      out.innerHTML = '<div class="card anim-fade-in"><h3>Diff Output</h3><pre>' + esc(r.diff || '(no changes)') + '</pre></div>';
    }).catch(function (e) {
      showToast(e.message, 'error');
    });
  };

  window.gitStatus = function (wsId, projId) {
    haptic('medium');
    api('/api/git/' + wsId + '/status?projectId=' + projId).then(function (r) {
      var out = document.getElementById('git-output');
      if (!out) return;
      var html = '<div class="card anim-fade-in"><h3>Status</h3>'
        + '<div class="card-section">'
        + '<div class="card-row"><span class="label">Branch</span><span class="value" style="font-family:var(--font-mono);font-size:13px">' + esc(r.branch) + '</span></div>'
        + '<div class="card-row"><span class="label">Clean</span><span class="value">' + (r.clean ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-danger">No</span>') + '</span></div>';
      if (r.files && r.files.length) {
        html += '<div class="card-row"><span class="label">Files</span><span class="value" style="font-family:var(--font-mono);font-size:12px">' + esc(r.files.join('\n')) + '</span></div>';
      }
      html += '</div></div>';
      out.innerHTML = html;
    }).catch(function (e) {
      showToast(e.message, 'error');
    });
  };

  window.showCommitModal = function (wsId, projId) {
    haptic('medium');
    var bodyHtml = ''
      + '<div class="form-group">'
      + '  <label class="form-label">Commit Message</label>'
      + '  <input type="text" class="form-input" id="commit-msg" placeholder="Describe your changes" autocomplete="off">'
      + '  <div class="form-error">Message is required</div>'
      + '</div>'
      + '<button class="btn btn-primary btn-block mt-3" onclick="gitCommit(\'' + wsId + '\',\'' + projId + '\',this)">Commit Changes</button>';

    openSheet('Commit Changes', bodyHtml);

    setTimeout(function () {
      var inp = document.getElementById('commit-msg');
      if (inp) inp.focus();
    }, 400);
  };

  window.gitCommit = function (wsId, projId, btn) {
    var msg = document.getElementById('commit-msg').value.trim();
    if (!msg) {
      document.getElementById('commit-msg').classList.add('error');
      showToast('Please enter a commit message', 'warning');
      return;
    }
    document.getElementById('commit-msg').classList.remove('error');

    haptic('medium');
    btn.disabled = true;
    btn.textContent = 'Committing\u2026';

    api('/api/git/' + wsId + '/commit', {
      method: 'POST',
      body: JSON.stringify({ message: msg, projectId: projId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function (r) {
      closeSheet();
      showToast('Committed: ' + esc(r.sha ? r.sha.slice(0, 7) : ''), 'success');
      var out = document.getElementById('git-output');
      if (out) {
        out.innerHTML = '<div class="status-msg status-success anim-fade-in"><span class="status-msg-icon">&#10003;</span><span>Committed: <code>' + esc(r.sha || '') + '</code></span></div>';
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = 'Commit Changes';
      showToast(e.message, 'error');
    });
  };

  window.gitAction = function (wsId, projId, action) {
    haptic('medium');
    api('/api/git/' + wsId + '/' + action, {
      method: 'POST',
      body: JSON.stringify({ projectId: projId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function (r) {
      showToast(action.charAt(0).toUpperCase() + action.slice(1) + ' completed', 'success');
      var out = document.getElementById('git-output');
      if (out) {
        out.innerHTML = '<div class="status-msg status-success anim-fade-in"><span class="status-msg-icon">&#10003;</span><span>' + action.charAt(0).toUpperCase() + action.slice(1) + ' completed successfully</span></div>';
      }
    }).catch(function (e) {
      showToast(e.message, 'error');
    });
  };

  window.gitLog = function (wsId, projId) {
    haptic('medium');
    api('/api/git/' + wsId + '/log?projectId=' + projId + '&limit=10').then(function (r) {
      var out = document.getElementById('git-output');
      if (!out) return;
      var html = '<div class="card anim-fade-in"><h3>Recent Commits</h3>';
      if (r.commits && r.commits.length) {
        for (var ci = 0; ci < r.commits.length; ci++) {
          var c = r.commits[ci];
          html += '<div class="card-row">'
            + '<span class="value" style="font-size:13px">'
            + '<code>' + esc(c.sha ? c.sha.slice(0, 7) : '') + '</code> '
            + esc((c.message || '').split('\n')[0])
            + ' <span style="color:var(--tg-hint);font-size:12px">by ' + esc(c.author || '') + '</span>'
            + '</span>'
            + '</div>';
        }
      } else {
        html += '<p>No commits yet.</p>';
      }
      html += '</div>';
      out.innerHTML = html;
    }).catch(function (e) {
      showToast(e.message, 'error');
    });
  };

  window.gitCheckout = function (wsId, projId, branch) {
    showConfirm('Switch to "' + branch + '"?', function () {
      showLoading('detail');
      api('/api/git/' + wsId + '/checkout', {
        method: 'POST',
        body: JSON.stringify({ branch: branch, projectId: projId, onDirty: 'stash' }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function (r) {
        showToast('Switched to ' + esc(r.branch || branch), 'success');
        renderProjectDetail(projId);
      }).catch(function (e) {
        showError(e.message);
      });
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. Terminal / Session
  // ═══════════════════════════════════════════════════════════════════════════

  function renderTerminal(sessionId) {
    var host = window.location.host;
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    var html = '<div class="ws-detail-header anim-slide-up">'
      + '<button class="btn btn-ghost btn-sm" onclick="disconnectTerminal();location.hash=\'#dashboard\'" aria-label="Back">'
      + '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
      + '</button>'
      + '<h1>Session Terminal</h1>'
      + '<div class="terminal-info" style="margin-left:auto">'
      + '  <span id="terminal-status-badge"><span class="badge badge-neutral">Connecting...</span></span>'
      + '</div>'
      + '</div>';

    html += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div id="terminal-container" style="height:400px;width:100%"></div>'
      + '</div>';

    html += '<div class="terminal-keys" style="margin-bottom:var(--space-4)">'
      + '<button class="btn btn-sm" onclick="terminalKey(\'tab\')">Tab</button>'
      + '<button class="btn btn-sm" onclick="terminalKey(\'enter\')">Enter</button>'
      + '<button class="btn btn-sm" onclick="terminalKey(\'up\')">&#8593; Up</button>'
      + '<button class="btn btn-sm" onclick="terminalKey(\'down\')">&#8595; Down</button>'
      + '<button class="btn btn-sm btn-danger" onclick="terminalKey(\'ctrl+c\')">Ctrl+C</button>'
      + '<button class="btn btn-sm btn-danger" onclick="cancelSession(\'' + jsStr(sessionId) + '\',this)" style="margin-left:auto">&#10005; End Session</button>'
      + '</div>';

    html += '<div id="terminal-status" style="margin-bottom:var(--space-4)"></div>';
    html += '<div style="height:var(--space-4)"></div>';

    transitionTo(html, function () {

    // Initialize terminal
    try {
      var term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selection: 'rgba(88,166,255,0.3)' },
        cols: 80,
        rows: 24,
        allowTransparency: false,
      });
      activeTerminal = term;
      term.open(document.getElementById('terminal-container'));

      haptic('medium');

      term.onData(function (data) {
        if (activeSocket && activeSocket.connected) {
          activeSocket.emit('terminal:input', { data: data });
        }
      });

      // Update closing confirmation
      if (tg) tg.enableClosingConfirmation();

      var socketUrl = protocol + '//' + host + '/gateway';
      var socket = io(socketUrl, {
        query: { initData: tgInitData, session: sessionId },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });
      activeSocket = socket;

      socket.on('connect', function () {
        var badge = document.getElementById('terminal-status-badge');
        if (badge) badge.innerHTML = '<span class="badge badge-success">Connected</span>';
        var st = document.getElementById('terminal-status');
        if (st) st.innerHTML = '<div class="status-msg status-success anim-fade-in"><span class="status-msg-icon">&#10003;</span><span>Session connected</span></div>';
      });

      socket.on('terminal:data', function (data) {
        try { term.write(data); } catch (e) { /* ignore */ }
      });

      socket.on('terminal:exit', function (data) {
        var statusEl = document.getElementById('terminal-status');
        if (statusEl) {
          statusEl.innerHTML = '<div class="card" style="padding:var(--space-4)">'
            + '<div class="card-row">'
            + '<span class="label">Session Ended</span>'
            + '<span class="value">Exit code: ' + (data.code !== undefined && data.code !== null ? data.code : '\u2014') + ' \u00B7 ' + Math.round((data.durationMs || 0) / 1000) + 's</span>'
            + '</div>'
            + '<button class="btn btn-primary btn-block mt-3" onclick="location.hash=\'#dashboard\'">Back to Dashboard</button>'
            + '</div>';
        }
        var controls = document.querySelector('.terminal-keys');
        if (controls) controls.style.display = 'none';
        var badge = document.getElementById('terminal-status-badge');
        if (badge) badge.innerHTML = '<span class="badge badge-neutral">Ended</span>';

        if (tg) tg.disableClosingConfirmation();
      });

      socket.on('error', function (err) {
        var badge = document.getElementById('terminal-status-badge');
        if (badge) badge.innerHTML = '<span class="badge badge-danger">Error</span>';
        var st = document.getElementById('terminal-status');
        if (st) st.innerHTML = '<div class="status-msg status-error anim-fade-in"><span class="status-msg-icon">&#10007;</span><span>' + esc(typeof err === 'string' ? err : (err.message || 'Connection error')) + '</span></div>';
      });

      socket.on('disconnect', function () {
        var badge = document.getElementById('terminal-status-badge');
        if (badge) {
          var wasConnected = badge.querySelector('.badge-success');
          if (wasConnected) {
            badge.innerHTML = '<span class="badge badge-warning">Reconnecting...</span>';
          }
        }
        var st = document.getElementById('terminal-status');
        if (st) {
          st.innerHTML = '<div class="status-msg status-warning anim-fade-in"><span class="status-msg-icon">&#9888;</span><span>Connection lost. Reconnecting...</span></div>';
        }
      });

      socket.on('reconnect', function () {
        var badge = document.getElementById('terminal-status-badge');
        if (badge) badge.innerHTML = '<span class="badge badge-success">Connected</span>';
        var st = document.getElementById('terminal-status');
        if (st) st.innerHTML = '<div class="status-msg status-success anim-fade-in"><span class="status-msg-icon">&#10003;</span><span>Reconnected</span></div>';
      });

    } catch (e) {
      var tc = document.getElementById('terminal-container');
      if (tc) tc.innerHTML = '<div class="status-msg status-error anim-fade-in" style="margin:var(--space-4)"><span class="status-msg-icon">&#10007;</span><span>Failed to initialize terminal: ' + esc(e.message) + '</span></div>';
    }
    });
  }

  window.disconnectTerminal = function () {
    if (activeSocket) { try { activeSocket.disconnect(); } catch (e) { /* ignore */ } activeSocket = null; }
    if (activeTerminal) { try { activeTerminal.dispose(); } catch (e) { /* ignore */ } activeTerminal = null; }
    if (tg) tg.disableClosingConfirmation();
  };

  window.terminalKey = function (key) {
    haptic('light');
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('terminal:input', { type: 'key', data: key });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. Git Operations Page
  // ═══════════════════════════════════════════════════════════════════════════

  function renderGitOps(wsId) {
    showLoading('detail');
    api('/api/git/' + wsId + '/credentials').then(function (status) {
      var html = '<div class="ws-detail-header anim-slide-up">'
        + '<button class="btn btn-ghost btn-sm" onclick="location.hash=\'#workspace/' + wsId + '\'" aria-label="Back">'
        + '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
        + '</button>'
        + '<h1>Git Operations</h1>'
        + '</div>';

      // Credentials Card
      html += '<div class="card anim-slide-up" style="animation-delay:0.05s">'
        + '<h3>Credentials</h3>';

      if (status.isSet) {
        html += '<div class="card-section">'
          + '<div class="card-row"><span class="label">Status</span><span class="value"><span class="badge badge-success">Logged In</span></span></div>'
          + '<div class="card-row"><span class="label">Username</span><span class="value">' + esc(status.username || '') + '</span></div>'
          + '<div class="card-row"><span class="label">Token</span><span class="value" style="font-family:var(--font-mono);font-size:13px">' + esc(status.tokenMasked || '') + '</span></div>'
          + '</div>'
          + '<div class="btn-group">'
          + '<button class="btn" onclick="testGitCredentials(\'' + wsId + '\')">Test</button>'
          + '<button class="btn btn-danger" onclick="logoutGit(\'' + wsId + '\')">Logout</button>'
          + '</div>';
      } else {
        html += '<p>Not configured. Add Git credentials to enable version control in your workspace.</p>'
          + '<div class="form-group mt-3"><label class="form-label">Username</label><input type="text" class="form-input" id="git-user" placeholder="Git username"></div>'
          + '<div class="form-group"><label class="form-label">Token</label><input type="password" class="form-input" id="git-token" placeholder="Personal access token"></div>'
          + '<div class="form-group"><label class="form-label">Remote URL</label><input type="text" class="form-input" id="git-url" placeholder="https://github.com/org/repo.git"></div>'
          + '<button class="btn btn-primary btn-block" onclick="saveGitCredentials(\'' + wsId + '\')">Save &amp; Validate</button>';
      }
      html += '</div>';

      // Git Commands Card
      html += '<div class="card anim-slide-up" style="animation-delay:0.1s">'
        + '<h3>Git Commands</h3>'
        + '<p>Navigate to a project to run git commands like diff, commit, push, and pull.</p>'
        + '<button class="btn btn-primary btn-block" onclick="location.hash=\'#workspace/' + wsId + '\'">View Projects</button>'
        + '</div>';

      html += '<div id="git-output" class="git-output"></div>';
      html += '<div style="height:var(--space-4)"></div>';

      transitionTo(html);
    }).catch(function (e) {
      showError(e.message);
    });
  }

  window.testGitCredentials = function (wsId) {
    haptic('medium');
    var out = document.getElementById('git-output');
    if (out) out.innerHTML = '<div class="status-msg status-info anim-fade-in"><span class="status-msg-icon">&#9432;</span><span>Testing credentials...</span></div>';
    api('/api/git/' + wsId + '/credentials', { method: 'GET' }).then(function (status) {
      if (out) {
        if (status.isSet) {
          out.innerHTML = '<div class="status-msg status-success anim-fade-in"><span class="status-msg-icon">&#10003;</span><span>Credentials are set for <strong>' + esc(status.username || '') + '</strong></span></div>';
        } else {
          out.innerHTML = '<div class="status-msg status-error anim-fade-in"><span class="status-msg-icon">&#10007;</span><span>No credentials set</span></div>';
        }
      }
    }).catch(function (e) {
      if (out) out.innerHTML = '<div class="status-msg status-error anim-fade-in"><span class="status-msg-icon">&#10007;</span><span>' + esc(e.message) + '</span></div>';
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 18. Session List
  // ═══════════════════════════════════════════════════════════════════════════

  function renderSessionList() {
    showLoading('list');
    api('/api/sessions').then(function (sessions) {
      if (!Array.isArray(sessions)) sessions = [];

      var html = '<h1 class="anim-slide-up">Sessions</h1>'
        + '<div class="card">';

      if (sessions.length === 0) {
        html += '<div class="empty-state">'
          + '<div class="empty-state-icon">&#128195;</div>'
          + '<div class="empty-state-title">No Sessions Yet</div>'
          + '<div class="empty-state-desc">Start a coding session from the Dashboard.</div>'
          + '<button class="btn btn-primary" onclick="location.hash=\'#dashboard\'">Go to Dashboard</button>'
          + '</div>';
      } else {
        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          html += '<div class="list-item">'
            + '<div class="info">'
            + '<div class="primary">'
            + '<span style="font-family:var(--font-mono);font-size:13px">' + esc(s.publicId || s.id) + '</span> '
            + (s.running ? '<span class="badge badge-success">Running</span>' : '<span class="badge badge-neutral">Stopped</span>')
            + '</div>'
            + '<div class="secondary">' + esc((s.prompt || '').slice(0, 80)) + '</div>'
            + '<div class="session-status">' + esc(s.workspaceName || '') + '</div>'
            + '</div>'
            + '<div class="session-actions">';
          if (s.running) {
            html += '<button class="btn btn-sm" onclick="location.hash=\'#session/' + jsStr(s.id) + '\'">&#9000;</button>';
          }
          html += '<button class="btn btn-sm btn-danger" onclick="cancelSession(\'' + jsStr(s.id) + '\',this)">&#10005;</button>'
            + '</div>'
            + '</div>';
        }
      }

      html += '</div>';
      html += '<div style="height:var(--space-4)"></div>';
      transitionTo(html);
    }).catch(function (e) {
      showError(e.message);
    });
  }

  window.cancelSession = function (id, btn) {
    haptic('medium');
    btn.disabled = true;
    btn.innerHTML = '...';
    api('/api/sessions/' + id + '/cancel', { method: 'POST' }).then(function () {
      showToast('Session cancelled', 'info');
      renderSessionList();
    }).catch(function (e) {
      btn.disabled = false;
      btn.innerHTML = '&#10005;';
      showToast(e.message, 'error');
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 19. Reusable UI Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  function renderBadge(text, type) {
    if (!text) return '';
    type = type || 'neutral';
    return '<span class="badge badge-' + type + '">' + esc(text) + '</span>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 20. Init
  // ═══════════════════════════════════════════════════════════════════════════

  // Initial render
  renderRoute();

  // If there's an active session from initial state, navigate to it
  if (state.session) {
    navigate('#session/' + state.session);
  }

})();
