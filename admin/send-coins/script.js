/* ============================================================
 * EDMFire Admin — SendCoins / Admin Host Deposit
 *
 * Calls cloud function:
 *   POST https://asia-south1-edm-fire-app.cloudfunctions.net/adminHostDeposit
 *   Headers: Authorization: Bearer <admin-id-token>
 *            Content-Type: application/json
 *   Body:    { uid: <host-uid>, amount: <rupees> }
 *
 * Response (success):
 *   {
 *     success: true,
 *     message: "₹<amount> deposited successfully to host wallet",
 *     data: {
 *       hostName, hostUid, amount, amountInPaisa,
 *       newTopUpCoins, newWalletBalance, transactionId, timestamp
 *     }
 *   }
 *
 * Auth: Only the admin UID (UWSPOJ48pnXHAbizdNIHHaMWsRm2) is allowed by the
 * cloud function. The Bearer token is the admin's Firebase ID token, obtained
 * from `currentAdmin.getIdToken()` (currentAdmin is set by nav.js initAuthGuard).
 *
 * Verify Host UID feature:
 *   Before depositing, the admin can click "Verify" to look up the host's
 *   identity (fullName, gmail, mobile, state, ffNickname, status) and current
 *   wallet balances (TopUpCoins, WalletBalance — both in paisa) directly from
 *   Firestore:
 *     - hosts/{uid}                       (identity doc)
 *     - hosts/{uid}/accountBalance/wallet (wallet doc)
 *   This is a READ-ONLY lookup — it does NOT modify any data. The admin can
 *   then confirm they are depositing to the right host before clicking
 *   "Send Coins". Verification is invalidated whenever the UID input changes.
 *
 * History: Last 50 deposits are stored in localStorage under
 *   `edmfireSendCoinsHistory` (JSON array, most-recent first).
 *   This is for admin reference only — not synced to Firestore.
 * ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initAuthGuard === 'function') {
    initAuthGuard(function(user) {
      initSendCoinsUI(user);
    });
  } else {
    initSendCoinsUI(null);
  }
  if (typeof initCommonUI === 'function') initCommonUI();
});

function initSendCoinsUI(adminUser) {
  'use strict';

  // ============== Constants ==============
  var CLOUD_FUNCTION_URL = 'https://asia-south1-edm-fire-app.cloudfunctions.net/adminHostDeposit';
  var HISTORY_KEY = 'edmfireSendCoinsHistory';
  var HISTORY_MAX = 50;

  // ============== State ==============
  var currentUser = adminUser; // Firebase user object — has getIdToken()

  // ============== Elements ==============
  var scUid = document.getElementById('scUid');
  var scAmount = document.getElementById('scAmount');
  var scSendBtn = document.getElementById('scSendBtn');
  var scClearBtn = document.getElementById('scClearBtn');
  var scResultMsg = document.getElementById('scResultMsg');
  var scDetailsCard = document.getElementById('scDetailsCard');
  var scDetailsGrid = document.getElementById('scDetailsGrid');

  // Verify-related elements
  var scVerifyBtn = document.getElementById('scVerifyBtn');
  var scVerifyCard = document.getElementById('scVerifyCard');
  var scVerifyTitle = document.getElementById('scVerifyTitle');
  var scVerifyBody = document.getElementById('scVerifyBody');

  var scHistoryCount = document.getElementById('scHistoryCount');
  var scHistoryList = document.getElementById('scHistoryList');
  var scClearHistoryBtn = document.getElementById('scClearHistoryBtn');

  // ============== Verify State ==============
  // verifiedUid: the UID that was last successfully verified (null = nothing verified yet)
  // verifiedHostData: the host identity doc data from Firestore (null = not verified / error)
  // verifiedWalletData: the wallet doc data from Firestore (null = not verified / no wallet doc)
  var verifiedUid = null;
  var verifiedHostData = null;
  var verifiedWalletData = null;

  // ============== Helpers ==============
  function showMsg(text, type) {
    scResultMsg.textContent = text;
    scResultMsg.className = 'sc-result-msg ' + type;
    if (type === 'success' || type === 'info') {
      setTimeout(function() {
        // Don't auto-hide errors — admin should see them
        scResultMsg.className = 'sc-result-msg';
      }, 8000);
    }
  }

  function clearMsg() {
    scResultMsg.className = 'sc-result-msg';
    scResultMsg.textContent = '';
  }

  function escapeHtml(t) {
    if (t == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(t)));
    return d.innerHTML;
  }

  function formatRupees(rupees) {
    var n = Number(rupees);
    if (isNaN(n)) return '₹0';
    if (n % 1 === 0) return '₹' + n;
    return '₹' + n.toFixed(2);
  }

  function formatPaisaAsRupees(paisa) {
    var n = Number(paisa);
    if (isNaN(n)) return '₹0';
    var rupees = n / 100;
    return formatRupees(rupees);
  }

  function getInitial(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  function formatPaisa(paisa) {
    var n = Number(paisa);
    if (isNaN(n)) return '—';
    return n.toLocaleString('en-IN') + ' p';
  }

  // ============== Validate & Update Button State ==============
  function updateSendButtonState() {
    var uidVal = scUid.value.trim();
    var amountVal = scAmount.value.trim();
    var amountNum = parseFloat(amountVal);
    var isValid = uidVal.length > 0 && amountVal.length > 0 && !isNaN(amountNum) && amountNum > 0;
    scSendBtn.disabled = !isValid;
    updateVerifyButtonState();
  }

  function updateVerifyButtonState() {
    var uidVal = scUid.value.trim();
    // Disable verify button if UID is empty or if we're already verified for this exact UID
    if (uidVal.length === 0) {
      scVerifyBtn.disabled = true;
      scVerifyBtn.classList.remove('is-verified');
      return;
    }
    if (verifiedUid === uidVal && verifiedHostData) {
      // Already verified for this UID — show as verified (green) but still allow re-verify
      scVerifyBtn.disabled = false;
      scVerifyBtn.classList.add('is-verified');
    } else {
      scVerifyBtn.disabled = false;
      scVerifyBtn.classList.remove('is-verified');
    }
  }

  function invalidateVerifyState() {
    // Called whenever UID input changes — clear stale verification
    verifiedUid = null;
    verifiedHostData = null;
    verifiedWalletData = null;
    scVerifyCard.style.display = 'none';
    scVerifyCard.classList.remove('is-error');
    scVerifyBody.innerHTML = '';
    updateVerifyButtonState();
  }

  scUid.addEventListener('input', function() {
    invalidateVerifyState();
    updateSendButtonState();
  });
  scAmount.addEventListener('input', updateSendButtonState);

  // ============== Verify Host UID ==============
  scVerifyBtn.addEventListener('click', async function() {
    var uid = scUid.value.trim();
    if (!uid) {
      showMsg('Enter a Host UID first, then click Verify.', 'error');
      scUid.focus();
      return;
    }

    // Need Firebase Firestore — should be loaded globally
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      showMsg('Firestore not initialized. Reload the page and try again.', 'error');
      return;
    }

    // Set verifying state
    scVerifyBtn.disabled = true;
    scVerifyBtn.classList.add('is-verifying');
    scVerifyBtn.classList.remove('is-verified');
    var originalLabel = scVerifyBtn.querySelector('span').textContent;
    scVerifyBtn.querySelector('span').textContent = 'Verifying...';

    try {
      var db = firebase.firestore();

      console.log('[SendCoins:Verify] Looking up host:', uid);

      // Parallel reads: identity doc + wallet doc
      var hostDocRef = db.collection('hosts').doc(uid);
      var walletDocRef = db.collection('hosts').doc(uid).collection('accountBalance').doc('wallet');

      var results = await Promise.all([
        hostDocRef.get().catch(function(e) { return { __error: e }; }),
        walletDocRef.get().catch(function(e) { return { __error: e }; })
      ]);

      var hostSnap = results[0];
      var walletSnap = results[1];

      // If host doc read errored (e.g. permissions), surface it
      if (hostSnap && hostSnap.__error) {
        console.error('[SendCoins:Verify] Host doc read error:', hostSnap.__error);
        throw new Error('Could not read host document: ' + (hostSnap.__error.message || 'permission denied'));
      }

      if (!hostSnap || !hostSnap.exists) {
        // ============== HOST NOT FOUND ==============
        console.warn('[SendCoins:Verify] Host not found:', uid);
        verifiedUid = null;
        verifiedHostData = null;
        verifiedWalletData = null;
        renderVerifyError(uid);
        showMsg('❌ No host found with that UID. Check the UID and try again.', 'error');
        return;
      }

      // ============== HOST FOUND ==============
      var hostData = hostSnap.data() || {};
      var walletData = null;

      if (walletSnap && !walletSnap.__error && walletSnap.exists) {
        walletData = walletSnap.data() || {};
      } else if (walletSnap && walletSnap.__error) {
        console.warn('[SendCoins:Verify] Wallet doc read error (non-fatal):', walletSnap.__error);
      }

      verifiedUid = uid;
      verifiedHostData = hostData;
      verifiedWalletData = walletData;

      renderVerifySuccess(uid, hostData, walletData);
      showMsg('✅ Host verified: ' + (hostData.fullName || '(no name)'), 'success');

      // Focus amount input for next step
      scAmount.focus();

    } catch (err) {
      console.error('[SendCoins:Verify] Exception:', err);
      var friendly = err.message || 'Verify failed.';
      if (friendly.indexOf('Failed to fetch') !== -1) {
        friendly = 'Network request failed. Check your connection and try again.';
      }
      verifiedUid = null;
      verifiedHostData = null;
      verifiedWalletData = null;
      renderVerifyError(uid, friendly);
      showMsg('❌ Verify failed: ' + friendly, 'error');
    } finally {
      scVerifyBtn.classList.remove('is-verifying');
      scVerifyBtn.querySelector('span').textContent = originalLabel;
      updateVerifyButtonState();
    }
  });

  // ============== Render Verify Card (Success) ==============
  function renderVerifySuccess(uid, hostData, walletData) {
    scVerifyCard.style.display = 'block';
    scVerifyCard.classList.remove('is-error');
    scVerifyTitle.textContent = '🔍 Host Verified';

    var fullName = hostData.fullName || '(no name on file)';
    var gmail = hostData.gmail || '—';
    var mobile = hostData.mobile || '—';
    var state = hostData.state || '—';
    var ffNickname = hostData.ffNickname || '—';
    var gameMode = hostData.gameModes === 'br' ? 'Battle Royale'
                 : hostData.gameModes === 'cs' ? 'Clash Squad'
                 : (hostData.gameModes || '—');
    var status = hostData.status || '—';
    var verifiedBy = hostData.verifiedBy || '—';

    // Wallet balances (paisa → rupees for display, both shown)
    var topUpPaisa = walletData ? Number(walletData.TopUpCoins) : null;
    var walletPaisa = walletData ? Number(walletData.WalletBalance) : null;
    var hasWallet = walletData != null && (topUpPaisa != null || walletPaisa != null);

    var statusPillHtml;
    if (status === 'verified') {
      statusPillHtml = '<span class="sc-verify-status-pill verified">✓ Verified Host</span>';
    } else if (status === 'pending' || status === 'unverified') {
      statusPillHtml = '<span class="sc-verify-status-pill pending">⚠ ' + escapeHtml(status) + '</span>';
    } else {
      statusPillHtml = '<span class="sc-verify-status-pill other">' + escapeHtml(status) + '</span>';
    }

    var html = '';

    // Summary row: avatar + name + UID + status pill
    html += '<div class="sc-verify-summary">' +
      '<div class="sc-verify-avatar">' + escapeHtml(getInitial(fullName)) + '</div>' +
      '<div class="sc-verify-summary-text">' +
        '<div class="sc-verify-name">' + escapeHtml(fullName) + '</div>' +
        '<div class="sc-verify-uid">' + escapeHtml(uid) + '</div>' +
        statusPillHtml +
      '</div>' +
    '</div>';

    // Detail grid
    html += '<div class="sc-verify-grid">';
    html += verifyItem('Gmail', gmail);
    html += verifyItem('Mobile', mobile);
    html += verifyItem('State', state);
    html += verifyItem('FF Nickname', ffNickname);
    html += verifyItem('Game Mode', gameMode);
    html += verifyItem('Verified By', verifiedBy);
    html += '</div>';

    // Wallet balances
    if (hasWallet) {
      html += '<div class="sc-verify-grid">';
      if (topUpPaisa != null && !isNaN(topUpPaisa)) {
        html += verifyItem('Current TopUpCoins', formatPaisaAsRupees(topUpPaisa) + ' <span class="sc-mono">(' + formatPaisa(topUpPaisa) + ')</span>', 'balance');
      }
      if (walletPaisa != null && !isNaN(walletPaisa)) {
        html += verifyItem('Current WalletBalance', formatPaisaAsRupees(walletPaisa) + ' <span class="sc-mono">(' + formatPaisa(walletPaisa) + ')</span>', 'balance');
      }
      html += '</div>';
    } else {
      html += '<div class="sc-verify-hint">⚠ No wallet document found at <code>hosts/' + escapeHtml(uid.substring(0, 12)) + '…/accountBalance/wallet</code>. The cloud function will create one on first deposit.</div>';
    }

    // Safety hint
    html += '<div class="sc-verify-hint">💡 Confirm the name above matches the host you intend to pay, then enter the amount and click <strong>Send Coins</strong>.</div>';

    scVerifyBody.innerHTML = html;
    scVerifyCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function verifyItem(label, value, extraClass) {
    return '<div class="sc-verify-item">' +
      '<span class="sc-verify-item-label">' + escapeHtml(label) + '</span>' +
      '<span class="sc-verify-item-value ' + (extraClass || '') + '">' + value + '</span>' +
    '</div>';
  }

  // ============== Render Verify Card (Error) ==============
  function renderVerifyError(uid, errorMsg) {
    scVerifyCard.style.display = 'block';
    scVerifyCard.classList.add('is-error');
    scVerifyTitle.textContent = '❌ Host Not Found';

    var msg = errorMsg || ('No host document exists at <code>hosts/' + escapeHtml(uid) + '</code>.');
    var html = '<div class="sc-verify-summary is-error">' +
      '<div class="sc-verify-avatar" style="background:linear-gradient(135deg,#ef4444,#b91c1c);">!</div>' +
      '<div class="sc-verify-summary-text">' +
        '<div class="sc-verify-name">Host lookup failed</div>' +
        '<div class="sc-verify-uid">' + escapeHtml(uid) + '</div>' +
      '</div>' +
    '</div>';
    html += '<div class="sc-verify-hint">' + msg + '</div>';
    scVerifyBody.innerHTML = html;
  }

  // ============== Send Coins — Main Action ==============
  scSendBtn.addEventListener('click', async function() {
    clearMsg();
    scDetailsCard.style.display = 'none';

    // Re-validate
    var uid = scUid.value.trim();
    var amountRaw = scAmount.value.trim();
    var amount = parseFloat(amountRaw);

    if (!uid) {
      showMsg('Host UID is required.', 'error');
      scUid.focus();
      return;
    }
    if (!amountRaw || isNaN(amount) || amount <= 0) {
      showMsg('Amount must be a number greater than 0.', 'error');
      scAmount.focus();
      return;
    }

    // Confirm — destructive/financial action
    // If host was verified, include the host name in the confirm dialog for extra safety
    var confirmMsg;
    if (verifiedUid === uid && verifiedHostData && verifiedHostData.fullName) {
      confirmMsg = 'Deposit ' + formatRupees(amount) + ' to:\n\n' +
                   '  Host: ' + verifiedHostData.fullName + '\n' +
                   '  UID:  ' + uid + '\n\nProceed?';
    } else {
      confirmMsg = 'Deposit ' + formatRupees(amount) + ' to host UID:\n' + uid +
                   '\n\n⚠ Tip: click "Verify" first to confirm the host name.\n\nProceed?';
    }
    if (!window.confirm(confirmMsg)) {
      showMsg('Deposit cancelled.', 'info');
      return;
    }

    // Need admin user token
    if (!currentUser || typeof currentUser.getIdToken !== 'function') {
      showMsg('Admin session not available. Please reload the page and sign in again.', 'error');
      return;
    }

    // Set sending state
    scSendBtn.disabled = true;
    scSendBtn.classList.add('is-sending');
    var originalLabel = scSendBtn.querySelector('span').textContent;
    scSendBtn.querySelector('span').textContent = 'Sending...';

    try {
      // Get fresh ID token (forceRefresh = true to avoid stale tokens)
      var idToken = await currentUser.getIdToken(true);

      console.log('[SendCoins] Calling cloud function:', CLOUD_FUNCTION_URL,
                '| uid:', uid, '| amount:', amount);

      var response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken
        },
        body: JSON.stringify({
          uid: uid,
          amount: amount
        })
      });

      var data;
      try {
        data = await response.json();
      } catch (parseErr) {
        // Cloud function returned non-JSON (likely 5xx with HTML body)
        throw new Error('Cloud function returned non-JSON response (HTTP ' + response.status + ').');
      }

      console.log('[SendCoins] Response:', response.status, data);

      if (response.ok && data && data.success) {
        // ============== SUCCESS ==============
        var d = data.data || {};
        showMsg('✅ ' + (data.message || 'Deposit successful.'), 'success');

        // Render details card
        renderDetailsCard(d, amount);

        // Save to history
        addToHistory({
          uid: d.hostUid || uid,
          hostName: d.hostName || '(unknown)',
          amount: d.amount != null ? d.amount : amount,
          amountInPaisa: d.amountInPaisa,
          newTopUpCoins: d.newTopUpCoins,
          newWalletBalance: d.newWalletBalance,
          transactionId: d.transactionId || '',
          timestamp: d.timestamp || '',
          adminEmail: currentUser.email || currentUser.uid,
          atMs: Date.now()
        });

        // Clear inputs + verification state
        scUid.value = '';
        scAmount.value = '';
        invalidateVerifyState();
        updateSendButtonState();
        scUid.focus();

      } else {
        // ============== FUNCTION-LEVEL ERROR ==============
        var errMsg = (data && data.message) ? data.message : ('Cloud function error (HTTP ' + response.status + ').');
        if (data && data.error) errMsg += ' [' + data.error + ']';
        showMsg('❌ ' + errMsg, 'error');
        console.error('[SendCoins] Function error:', data);
      }

    } catch (err) {
      // ============== NETWORK / UNEXPECTED ERROR ==============
      console.error('[SendCoins] Exception:', err);
      var friendly = err.message || 'Network error. Check your connection and try again.';
      // Common CORS / offline hints
      if (friendly.indexOf('Failed to fetch') !== -1) {
        friendly = 'Network request failed. The cloud function may be unreachable or you may be offline.';
      }
      showMsg('❌ ' + friendly, 'error');
    } finally {
      // Restore button state
      scSendBtn.classList.remove('is-sending');
      scSendBtn.querySelector('span').textContent = originalLabel;
      updateSendButtonState();
    }
  });

  // ============== Render Details Card ==============
  function renderDetailsCard(d, requestedAmount) {
    scDetailsCard.style.display = 'block';

    var rows = [
      { label: 'Host Name', value: d.hostName || '—', valueClass: '' },
      { label: 'Host UID', value: d.hostUid || '—', valueClass: 'mono' },
      { label: 'Amount Deposited', value: formatRupees(d.amount != null ? d.amount : requestedAmount), valueClass: 'success' },
      { label: 'Amount in Paisa', value: String(d.amountInPaisa != null ? d.amountInPaisa : '—'), valueClass: 'mono' },
      { label: 'New TopUpCoins (paisa)', value: String(d.newTopUpCoins != null ? d.newTopUpCoins : '—'), valueClass: 'mono' },
      { label: 'New WalletBalance (paisa)', value: String(d.newWalletBalance != null ? d.newWalletBalance : '—'), valueClass: 'mono' },
      { label: 'Transaction ID', value: d.transactionId || '—', valueClass: 'mono' },
      { label: 'Timestamp (IST)', value: d.timestamp || '—', valueClass: '' }
    ];

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="sc-detail-item">' +
        '<span class="sc-detail-label">' + escapeHtml(rows[i].label) + '</span>' +
        '<span class="sc-detail-value ' + rows[i].valueClass + '">' + escapeHtml(rows[i].value) + '</span>' +
        '</div>';
    }
    scDetailsGrid.innerHTML = html;

    // Scroll to details
    scDetailsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ============== Clear Button ==============
  scClearBtn.addEventListener('click', function() {
    scUid.value = '';
    scAmount.value = '';
    clearMsg();
    scDetailsCard.style.display = 'none';
    invalidateVerifyState();
    updateSendButtonState();
    scUid.focus();
  });

  // ============== History (localStorage) ==============
  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[SendCoins] Failed to parse history:', e);
      return [];
    }
  }

  function saveHistory(arr) {
    try {
      // Trim to most-recent HISTORY_MAX entries
      if (arr.length > HISTORY_MAX) arr = arr.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[SendCoins] Failed to save history:', e);
    }
  }

  function addToHistory(entry) {
    var list = loadHistory();
    list.unshift(entry); // most-recent first
    saveHistory(list);
    renderHistory();
  }

  function renderHistory() {
    var list = loadHistory();

    if (list.length === 0) {
      scHistoryCount.textContent = '0 deposits';
      scHistoryList.innerHTML = '<div class="sc-history-empty">No deposits yet from this browser. Successful deposits will appear here.</div>';
      return;
    }

    scHistoryCount.textContent = list.length + ' deposit' + (list.length === 1 ? '' : 's') +
                                 ' (showing most-recent ' + list.length + ')';

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var num = '#' + (i + 1);
      var amt = formatRupees(e.amount);
      var name = e.hostName || '(unknown)';
      var txn = e.transactionId || '—';
      var ts = e.timestamp || '';
      var uidShort = (e.uid || '').substring(0, 14);

      html += '<div class="sc-history-item">' +
        '<div class="sc-history-num">' + escapeHtml(num) + '</div>' +
        '<div class="sc-history-main">' +
          '<div class="sc-history-title">' + escapeHtml(name) + ' <span class="sc-amount">+' + escapeHtml(amt) + '</span></div>' +
          '<div class="sc-history-meta">' +
            '<span class="sc-meta-strong">UID:</span> <span class="sc-mono">' + escapeHtml(uidShort) + '</span>' +
            (uidShort.length < (e.uid || '').length ? '…' : '') +
            ' · <span class="sc-meta-strong">Txn:</span> <span class="sc-mono">' + escapeHtml(txn) + '</span>' +
            (ts ? ' · <span class="sc-meta-strong">' + escapeHtml(ts) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="sc-history-amount-pill">+' + escapeHtml(amt) + '</div>' +
      '</div>';
    }
    scHistoryList.innerHTML = html;
  }

  // ============== Clear History Button ==============
  scClearHistoryBtn.addEventListener('click', function() {
    var list = loadHistory();
    if (list.length === 0) {
      showMsg('History is already empty.', 'info');
      return;
    }
    if (!window.confirm('Clear all ' + list.length + ' deposit(s) from this browser\'s history?\n\n(This does NOT affect Firestore or the actual host wallet — only the local browser history for your reference.)')) {
      return;
    }
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showMsg('History cleared.', 'info');
  });

  // ============== Enter key triggers Send / Verify ==============
  scUid.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If UID has content but not yet verified, trigger Verify; otherwise jump to Amount
      var uidVal = scUid.value.trim();
      if (uidVal && verifiedUid !== uidVal && !scVerifyBtn.disabled) {
        scVerifyBtn.click();
      } else {
        scAmount.focus();
      }
    }
  });
  scAmount.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); if (!scSendBtn.disabled) scSendBtn.click(); }
  });

  // ============== Initial Render ==============
  updateSendButtonState();
  renderHistory();
}
