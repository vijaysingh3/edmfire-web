/* ============================================================
 * EDMFire Admin — Broadcast Notification Page
 * Calls Cloud Function: sendBatchNotification
 * Endpoint: POST https://asia-south1-edm-fire-app.cloudfunctions.net/sendBatchNotification
 * Body: { title, body }
 * ============================================================ */

// Wait for DOM + auth
document.addEventListener('DOMContentLoaded', function() {
  // Auth guard
  if (typeof initAuthGuard === 'function') {
    initAuthGuard(function(user) {
      initBroadcastUI();
    });
  } else {
    initBroadcastUI();
  }

  // Init sidebar UI
  if (typeof initCommonUI === 'function') initCommonUI();
});

function initBroadcastUI() {
  'use strict';

  // ============== Elements ==============
  var titleInput     = document.getElementById('notifTitle');
  var bodyInput      = document.getElementById('notifBody');
  var bodyCharCount  = document.getElementById('bodyCharCount');
  var sendBtn        = document.getElementById('sendBtn');
  var clearBtn       = document.getElementById('clearBtn');
  var clearLogBtn    = document.getElementById('clearLogBtn');
  var copyLogBtn     = document.getElementById('copyLogBtn');
  var logcatScreen   = document.getElementById('logcatScreen');
  var logStatus      = document.getElementById('logStatus');

  var ENDPOINT = 'https://asia-south1-edm-fire-app.cloudfunctions.net/sendBatchNotification';

  // ============== Helpers ==============
  function pad(n) { return String(n).padStart(2, '0'); }
  function now() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function log(message, level, tag) {
    level = level || 'info';
    tag = tag || 'INFO';
    var line = document.createElement('div');
    line.className = 'bc-log-line bc-log-' + level;
    var timeEl = document.createElement('span');
    timeEl.className = 'bc-log-time';
    timeEl.textContent = '[' + now() + ']';
    var tagEl = document.createElement('span');
    tagEl.className = 'bc-log-tag';
    tagEl.textContent = '[' + tag + ']';
    var msgEl = document.createElement('span');
    msgEl.className = 'bc-log-msg';
    msgEl.textContent = message;
    line.appendChild(timeEl);
    line.appendChild(tagEl);
    line.appendChild(msgEl);
    logcatScreen.appendChild(line);
    logcatScreen.scrollTop = logcatScreen.scrollHeight;
  }

  function setStatus(text, type) {
    logStatus.textContent = text;
    logStatus.className = 'bc-logcat-status' + (type ? ' ' + type : '');
  }

  function setBtnState(state) {
    sendBtn.classList.remove('sending', 'success', 'error');
    var icon = sendBtn.querySelector('.bc-btn-icon');
    var text = sendBtn.querySelector('.bc-btn-text');
    if (state === 'sending') {
      sendBtn.classList.add('sending');
      sendBtn.disabled = true;
      text.textContent = 'Sending...';
      icon.textContent = '⏳';
    } else if (state === 'success') {
      sendBtn.classList.add('success');
      sendBtn.disabled = false;
      text.textContent = 'Sent! Send Another';
      icon.textContent = '✅';
    } else if (state === 'error') {
      sendBtn.classList.add('error');
      sendBtn.disabled = false;
      text.textContent = 'Retry';
      icon.textContent = '⚠️';
    } else {
      sendBtn.disabled = !(titleInput.value.trim() && bodyInput.value.trim());
      text.textContent = 'Send to All Players';
      icon.textContent = '🚀';
    }
  }

  function validateInputs() {
    if (sendBtn.classList.contains('sending')) return;
    var title = titleInput.value.trim();
    var body = bodyInput.value.trim();
    sendBtn.disabled = !(title.length > 0 && body.length > 0);
  }

  // ============== Input listeners ==============
  titleInput.addEventListener('input', validateInputs);
  bodyInput.addEventListener('input', function() {
    bodyCharCount.textContent = bodyInput.value.length;
    validateInputs();
  });

  clearBtn.addEventListener('click', function() {
    titleInput.value = '';
    bodyInput.value = '';
    bodyCharCount.textContent = '0';
    validateInputs();
    titleInput.focus();
  });

  // ============== Logcat controls ==============
  clearLogBtn.addEventListener('click', function() {
    logcatScreen.innerHTML = '';
    log('Log cleared by admin.', 'system', 'SYSTEM');
    setStatus('IDLE');
  });

  copyLogBtn.addEventListener('click', function() {
    var lines = [];
    var allLines = logcatScreen.querySelectorAll('.bc-log-line');
    for (var i = 0; i < allLines.length; i++) {
      lines.push(allLines[i].textContent.replace(/\s+/g, ' ').trim());
    }
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        log('Log copied to clipboard.', 'success', 'CLIPBOARD');
      }).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      log('Log copied to clipboard.', 'success', 'CLIPBOARD');
    } catch (e) {
      log('Failed to copy log: ' + e.message, 'error', 'CLIPBOARD');
    }
    document.body.removeChild(ta);
  }

  // ============== Send Action ==============
  sendBtn.addEventListener('click', function() {
    var title = titleInput.value.trim();
    var body = bodyInput.value.trim();

    if (!title || !body) {
      log('Title or Body is empty. Aborting send.', 'error', 'VALIDATE');
      return;
    }

    log('════════════════════════════════════════', 'system', 'BORDER');
    log('Preparing to send broadcast notification.', 'info', 'INIT');
    log('Title: ' + title, 'info', 'PAYLOAD');
    log('Body:  ' + body, 'info', 'PAYLOAD');

    setBtnState('sending');
    setStatus('SENDING', 'running');

    var payload = { title: title, body: body };
    var startTime = Date.now();

    log('POST ' + ENDPOINT, 'info', 'NETWORK');
    log('Request body: ' + JSON.stringify(payload), 'info', 'NETWORK');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(response) {
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      log('Response status: ' + response.status + ' ' + response.statusText, 'info', 'NETWORK');
      log('Time elapsed: ' + elapsed + 's', 'info', 'NETWORK');

      var contentType = response.headers.get('content-type') || '';
      return response.text().then(function(rawText) {
        var data;
        if (contentType.indexOf('application/json') >= 0) {
          try { data = JSON.parse(rawText); }
          catch (e) { data = { _raw: rawText }; }
        } else {
          data = { _raw: rawText };
        }
        log('Response body: ' + JSON.stringify(data, null, 2), 'info', 'NETWORK');
        return { ok: response.ok, status: response.status, data: data };
      });
    }).then(function(result) {
      if (result.ok) {
        var data = result.data || {};
        var sent = data.success || data.sent || data.processed ||
                   (data.result && (data.result.sent || data.result.success)) ||
                   data.count ||
                   (typeof data.success === 'number' ? data.success : null);
        var failed = data.failed || (data.result && data.result.failed) || 0;

        log('─────────────────────────────────────', 'system', 'BORDER');
        log('BROADCAST SENT SUCCESSFULLY', 'success', 'SUCCESS');
        if (sent != null) log('-> Notifications delivered: ' + sent, 'success', 'SUCCESS');
        if (failed > 0)   log('-> Failed tokens: ' + failed, 'warn', 'WARN');
        if (data.message) log('-> Server message: ' + data.message, 'success', 'SUCCESS');
        log('─────────────────────────────────────', 'system', 'BORDER');

        setBtnState('success');
        setStatus('SUCCESS', 'success');
      } else {
        var data = result.data || {};
        log('─────────────────────────────────────', 'system', 'BORDER');
        log('BROADCAST FAILED — HTTP ' + result.status, 'error', 'ERROR');
        if (data.error)   log('Error: ' + data.error, 'error', 'ERROR');
        if (data.message) log('Message: ' + data.message, 'error', 'ERROR');
        if (data.details) log('Details: ' + JSON.stringify(data.details), 'error', 'ERROR');
        log('─────────────────────────────────────', 'system', 'BORDER');

        setBtnState('error');
        setStatus('FAILED', 'error');
      }
    }).catch(function(err) {
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      log('─────────────────────────────────────', 'system', 'BORDER');
      log('NETWORK ERROR after ' + elapsed + 's', 'error', 'ERROR');
      log('Name: ' + err.name, 'error', 'ERROR');
      log('Message: ' + err.message, 'error', 'ERROR');
      if (err.stack) log('Stack: ' + err.stack.split('\n')[0], 'error', 'ERROR');
      log('─────────────────────────────────────', 'system', 'BORDER');

      setBtnState('error');
      setStatus('NETWORK ERROR', 'error');
    });
  });

  // ============== Init ==============
  validateInputs();
  log('Admin authenticated. Tool ready.', 'success', 'AUTH');
  log('Endpoint: ' + ENDPOINT, 'info', 'CONFIG');
  log('Fill Title + Body and click Send.', 'system', 'SYSTEM');
  log('══════════════ Next Request ══════════════', 'system', 'BORDER');
}
