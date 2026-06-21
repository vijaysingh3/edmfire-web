/* ============================================================
 * EDMFire Admin — Redeem Code Management
 * Firestore Path: RedeemCodes/{codeId}
 * Fields: code, value, isUsed, purchasedBy, purchasedAt,
 *         createdAt, createdBy, batchId, expiryDate
 * ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initAuthGuard === 'function') {
    initAuthGuard(function(user) {
      initRedeemCodesUI(user);
    });
  } else {
    initRedeemCodesUI(null);
  }
  if (typeof initCommonUI === 'function') initCommonUI();
});

function initRedeemCodesUI(adminUser) {
  'use strict';

  // ============== State ==============
  var adminUid = adminUser ? adminUser.uid : 'unknown-admin';
  var db = firebase.firestore();
  var CODES_REF = db.collection('RedeemCodes');

  var allCodes = [];          // full cache (filtered view)
  var currentFilter = 'all';  // all | available | used
  var currentValueFilter = ''; // '' | '10' | '20' ...
  var currentSearch = '';
  var currentPage = 1;
  var PAGE_SIZE = 25;

  // ============== Elements ==============
  var rcValue = document.getElementById('rcValue');
  var rcCount = document.getElementById('rcCount');
  var rcPrefix = document.getElementById('rcPrefix');
  var rcExpiry = document.getElementById('rcExpiry');
  var rcGenerateBtn = document.getElementById('rcGenerateBtn');
  var rcClearBtn = document.getElementById('rcClearBtn');
  var rcResultMsg = document.getElementById('rcResultMsg');

  var rcTotalCodes = document.getElementById('rcTotalCodes');
  var rcAvailable = document.getElementById('rcAvailable');
  var rcUsed = document.getElementById('rcUsed');
  var rcTotalValue = document.getElementById('rcTotalValue');

  var rcStockBody = document.getElementById('rcStockBody');
  var rcCodesBody = document.getElementById('rcCodesBody');
  var rcResultsCount = document.getElementById('rcResultsCount');
  var rcPagination = document.getElementById('rcPagination');

  var rcFilterTabs = document.querySelectorAll('.rc-filter-tab');
  var rcFilterValue = document.getElementById('rcFilterValue');
  var rcSearchInput = document.getElementById('rcSearchInput');
  var rcExportBtn = document.getElementById('rcExportBtn');
  var rcRefreshBtn = document.getElementById('rcRefreshBtn');

  var rcDeleteModal = document.getElementById('rcDeleteModal');
  var rcDeleteCodeDisplay = document.getElementById('rcDeleteCodeDisplay');
  var rcDeleteCancel = document.getElementById('rcDeleteCancel');
  var rcDeleteConfirm = document.getElementById('rcDeleteConfirm');
  var pendingDeleteId = null;
  var pendingDeleteCode = null;

  // ============== Helpers ==============
  function showMsg(text, type) {
    rcResultMsg.textContent = text;
    rcResultMsg.className = 'rc-result-msg ' + type;
    if (type === 'success' || type === 'info') {
      setTimeout(function() {
        rcResultMsg.className = 'rc-result-msg';
      }, 6000);
    }
  }

  function formatTimestamp(ts) {
    if (!ts) return '—';
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      var p = function(n) { return String(n).padStart(2, '0'); };
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
             ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return '—'; }
  }

  function truncate(str, n) {
    if (!str) return '—';
    return str.length > n ? str.substring(0, n) + '…' : str;
  }

  // ============== Code Generation ==============
  function generateCodeString(prefix) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O, 1/I)
    var random = '';
    for (var i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix + '-' + random;
  }

  function generateUniqueCodes(prefix, count, existingSet) {
    var codes = [];
    var attempts = 0;
    var maxAttempts = count * 10;
    while (codes.length < count && attempts < maxAttempts) {
      var c = generateCodeString(prefix);
      if (!existingSet.has(c)) {
        existingSet.add(c);
        codes.push(c);
      }
      attempts++;
    }
    return codes;
  }

  // ============== Generate Codes ==============
  rcGenerateBtn.addEventListener('click', async function() {
    var value = parseInt(rcValue.value, 10);
    var count = parseInt(rcCount.value, 10);
    var prefix = rcPrefix.value.trim().toUpperCase() || 'EDM-REDEEM';
    var expiryRaw = rcExpiry.value;

    if (!value || value < 1) {
      showMsg('Please select a valid code value.', 'error');
      return;
    }
    if (!count || count < 1) {
      showMsg('Please enter a valid number of codes.', 'error');
      return;
    }
    if (count > 500) {
      showMsg('Maximum 500 codes per batch.', 'error');
      return;
    }
    if (!/^[A-Z0-9-]+$/.test(prefix)) {
      showMsg('Prefix can only contain letters, numbers, and hyphens.', 'error');
      return;
    }

    var expiryDate = null;
    if (expiryRaw) {
      expiryDate = firebase.firestore.Timestamp.fromDate(new Date(expiryRaw + 'T23:59:59'));
    }

    rcGenerateBtn.disabled = true;
    rcGenerateBtn.querySelector('span').textContent = 'Generating...';
    showMsg('Generating ' + count + ' codes of ₹' + value + '...', 'info');

    try {
      // 1. Fetch existing codes to avoid duplicates (limit scope: only same-prefix)
      // For performance, we just generate and check uniqueness against a small set pulled
      // from current allCodes cache + a quick existence check via Firestore
      var existingSet = new Set();
      for (var i = 0; i < allCodes.length; i++) {
        existingSet.add(allCodes[i].code);
      }

      var codes = generateUniqueCodes(prefix, count, existingSet);
      if (codes.length < count) {
        showMsg('Could not generate ' + count + ' unique codes. Generated ' + codes.length + '. Please retry.', 'error');
        rcGenerateBtn.disabled = false;
        rcGenerateBtn.querySelector('span').textContent = 'Generate Codes';
        return;
      }

      // 2. Batch write to Firestore
      var batchId = 'BATCH_' + Date.now();
      var createdAt = firebase.firestore.FieldValue.serverTimestamp();
      var batch = db.batch();
      var codeDocs = [];

      for (var j = 0; j < codes.length; j++) {
        var docRef = CODES_REF.doc(); // auto ID
        var data = {
          code: codes[j],
          value: value,
          isUsed: false,
          purchasedBy: '',
          purchasedAt: null,
          createdAt: createdAt,
          createdBy: adminUid,
          batchId: batchId,
          expiryDate: expiryDate
        };
        batch.set(docRef, data);
        codeDocs.push({ id: docRef.id, code: codes[j], value: value, isUsed: false, purchasedBy: '', purchasedAt: null, createdAt: null, createdBy: adminUid, batchId: batchId, expiryDate: expiryDate });
      }

      await batch.commit();

      showMsg('✅ ' + codes.length + ' codes of ₹' + value + ' generated successfully! Batch: ' + batchId, 'success');

      // Reset count field
      rcCount.value = 10;

      // Reload data
      loadAllCodes();
      loadStockSummary();
    } catch (err) {
      console.error('[RedeemCodes] Generate error:', err);
      showMsg('Failed to generate codes: ' + err.message, 'error');
    } finally {
      rcGenerateBtn.disabled = false;
      rcGenerateBtn.querySelector('span').textContent = 'Generate Codes';
    }
  });

  rcClearBtn.addEventListener('click', function() {
    rcValue.value = '10';
    rcCount.value = '10';
    rcPrefix.value = 'EDM-REDEEM';
    rcExpiry.value = '';
    rcResultMsg.className = 'rc-result-msg';
  });

  // ============== Load Stock Summary ==============
  async function loadStockSummary() {
    try {
      rcStockBody.innerHTML = '<tr><td colspan="6" class="rc-empty">Loading...</td></tr>';
      var snapshot = await CODES_REF.get();

      var stats = {};
      [10, 20, 30, 40, 50].forEach(function(v) {
        stats[v] = { total: 0, available: 0, used: 0 };
      });

      var totalAll = 0, availableAll = 0, usedAll = 0, totalValueAll = 0;

      snapshot.forEach(function(doc) {
        var d = doc.data();
        var v = d.value;
        if (!stats[v]) stats[v] = { total: 0, available: 0, used: 0 };
        stats[v].total++;
        if (d.isUsed) {
          stats[v].used++;
          usedAll++;
        } else {
          stats[v].available++;
          availableAll++;
        }
        totalAll++;
        totalValueAll += (v || 0);
      });

      // Update top stat cards
      rcTotalCodes.textContent = totalAll;
      rcAvailable.textContent = availableAll;
      rcUsed.textContent = usedAll;
      rcTotalValue.textContent = '₹' + totalValueAll.toLocaleString('en-IN');

      // Render stock table
      rcStockBody.innerHTML = '';
      var hasRows = false;
      [10, 20, 30, 40, 50].forEach(function(v) {
        var s = stats[v];
        if (s.total === 0) return;
        hasRows = true;
        var pctUsed = s.total > 0 ? Math.round((s.used / s.total) * 100) : 0;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="rc-value-cell">₹' + v + '</td>' +
          '<td>' + s.total + '</td>' +
          '<td style="color:#22c55e;font-weight:600;">' + s.available + '</td>' +
          '<td style="color:#ef4444;font-weight:600;">' + s.used + '</td>' +
          '<td>' + pctUsed + '%</td>' +
          '<td><div class="rc-progress-bar"><div class="rc-progress-fill" style="width:' + pctUsed + '%"></div></div></td>';
        rcStockBody.appendChild(tr);
      });

      if (!hasRows) {
        rcStockBody.innerHTML = '<tr><td colspan="6" class="rc-empty">No codes yet. Generate some above.</td></tr>';
      }
    } catch (err) {
      console.error('[RedeemCodes] Stock summary error:', err);
      rcStockBody.innerHTML = '<tr><td colspan="6" class="rc-empty">Error: ' + err.message + '</td></tr>';
    }
  }

  // ============== Load All Codes ==============
  async function loadAllCodes() {
    try {
      rcResultsCount.textContent = 'Loading...';
      rcCodesBody.innerHTML = '<tr><td colspan="7" class="rc-empty">Loading...</td></tr>';

      var snapshot = await CODES_REF.orderBy('createdAt', 'desc').limit(500).get();
      allCodes = [];
      snapshot.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        allCodes.push(d);
      });

      renderCodesTable();
    } catch (err) {
      console.error('[RedeemCodes] Load error:', err);
      rcCodesBody.innerHTML = '<tr><td colspan="7" class="rc-empty">Error: ' + err.message + '</td></tr>';
      rcResultsCount.textContent = 'Error loading codes';
    }
  }

  // ============== Filter & Render Codes Table ==============
  function getFilteredCodes() {
    return allCodes.filter(function(c) {
      // Status filter
      if (currentFilter === 'available' && c.isUsed) return false;
      if (currentFilter === 'used' && !c.isUsed) return false;
      // Value filter
      if (currentValueFilter && String(c.value) !== currentValueFilter) return false;
      // Search
      if (currentSearch) {
        var q = currentSearch.toLowerCase();
        var codeMatch = c.code && c.code.toLowerCase().indexOf(q) >= 0;
        var userMatch = c.purchasedBy && c.purchasedBy.toLowerCase().indexOf(q) >= 0;
        if (!codeMatch && !userMatch) return false;
      }
      return true;
    });
  }

  function renderCodesTable() {
    var filtered = getFilteredCodes();
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var end = start + PAGE_SIZE;
    var pageItems = filtered.slice(start, end);

    rcResultsCount.textContent = total + ' code(s) found' +
      (total > PAGE_SIZE ? ' (showing ' + (start + 1) + '-' + Math.min(end, total) + ')' : '');

    if (pageItems.length === 0) {
      rcCodesBody.innerHTML = '<tr><td colspan="7" class="rc-empty">No codes match your filters.</td></tr>';
      rcPagination.innerHTML = '';
      return;
    }

    rcCodesBody.innerHTML = '';
    for (var i = 0; i < pageItems.length; i++) {
      var c = pageItems[i];
      var tr = document.createElement('tr');

      var statusBadge = c.isUsed
        ? '<span class="rc-status-badge rc-status-used">● Used</span>'
        : '<span class="rc-status-badge rc-status-available">○ Available</span>';

      tr.innerHTML =
        '<td class="rc-code-cell">' + escapeHtml(c.code || '—') + '</td>' +
        '<td class="rc-value-cell">₹' + (c.value || 0) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td title="' + escapeHtml(c.purchasedBy || '') + '">' + escapeHtml(truncate(c.purchasedBy, 18)) + '</td>' +
        '<td>' + formatTimestamp(c.createdAt) + '</td>' +
        '<td>' + formatTimestamp(c.purchasedAt) + '</td>' +
        '<td>' +
          '<button class="rc-copy-btn" data-copy="' + escapeHtml(c.code || '') + '">Copy</button>' +
          '<button class="rc-action-btn" data-del="' + escapeHtml(c._id) + '" data-code="' + escapeHtml(c.code || '') + '">Delete</button>' +
        '</td>';

      rcCodesBody.appendChild(tr);
    }

    // Pagination
    renderPagination(totalPages);

    // Bind action buttons
    bindTableActions();
  }

  function renderPagination(totalPages) {
    rcPagination.innerHTML = '';
    if (totalPages <= 1) return;

    var addBtn = function(label, page, opts) {
      opts = opts || {};
      var btn = document.createElement('button');
      btn.className = 'rc-page-btn';
      btn.textContent = label;
      btn.disabled = opts.disabled || false;
      if (opts.active) btn.classList.add('active');
      btn.addEventListener('click', function() {
        currentPage = page;
        renderCodesTable();
      });
      rcPagination.appendChild(btn);
    };

    addBtn('‹', currentPage - 1, { disabled: currentPage === 1 });

    var maxVisible = 7;
    var startP = Math.max(1, currentPage - 3);
    var endP = Math.min(totalPages, startP + maxVisible - 1);
    if (endP - startP < maxVisible - 1) {
      startP = Math.max(1, endP - maxVisible + 1);
    }

    if (startP > 1) {
      addBtn('1', 1);
      if (startP > 2) {
        var ell = document.createElement('span');
        ell.textContent = '…';
        ell.style.color = '#6b6d85';
        ell.style.padding = '0 4px';
        rcPagination.appendChild(ell);
      }
    }

    for (var p = startP; p <= endP; p++) {
      addBtn(String(p), p, { active: p === currentPage });
    }

    if (endP < totalPages) {
      if (endP < totalPages - 1) {
        var ell2 = document.createElement('span');
        ell2.textContent = '…';
        ell2.style.color = '#6b6d85';
        ell2.style.padding = '0 4px';
        rcPagination.appendChild(ell2);
      }
      addBtn(String(totalPages), totalPages);
    }

    addBtn('›', currentPage + 1, { disabled: currentPage === totalPages });
  }

  function bindTableActions() {
    // Copy buttons
    var copyBtns = rcCodesBody.querySelectorAll('[data-copy]');
    for (var i = 0; i < copyBtns.length; i++) {
      copyBtns[i].addEventListener('click', function(e) {
        var code = e.currentTarget.getAttribute('data-copy');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function() {
            e.currentTarget.textContent = 'Copied!';
            setTimeout(function() { e.currentTarget.textContent = 'Copy'; }, 1500);
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); e.currentTarget.textContent = 'Copied!';
            setTimeout(function() { e.currentTarget.textContent = 'Copy'; }, 1500);
          } catch (err) {}
          document.body.removeChild(ta);
        }
      });
    }

    // Delete buttons
    var delBtns = rcCodesBody.querySelectorAll('[data-del]');
    for (var j = 0; j < delBtns.length; j++) {
      delBtns[j].addEventListener('click', function(e) {
        pendingDeleteId = e.currentTarget.getAttribute('data-del');
        pendingDeleteCode = e.currentTarget.getAttribute('data-code');
        rcDeleteCodeDisplay.textContent = pendingDeleteCode;
        rcDeleteModal.classList.add('active');
      });
    }
  }

  // ============== Delete Modal ==============
  rcDeleteCancel.addEventListener('click', function() {
    rcDeleteModal.classList.remove('active');
    pendingDeleteId = null;
    pendingDeleteCode = null;
  });

  rcDeleteModal.addEventListener('click', function(e) {
    if (e.target === rcDeleteModal) {
      rcDeleteModal.classList.remove('active');
      pendingDeleteId = null;
      pendingDeleteCode = null;
    }
  });

  rcDeleteConfirm.addEventListener('click', async function() {
    if (!pendingDeleteId) return;
    rcDeleteConfirm.disabled = true;
    rcDeleteConfirm.textContent = 'Deleting...';
    try {
      await CODES_REF.doc(pendingDeleteId).delete();
      showMsg('Code ' + pendingDeleteCode + ' deleted.', 'success');
      rcDeleteModal.classList.remove('active');
      pendingDeleteId = null;
      pendingDeleteCode = null;
      loadAllCodes();
      loadStockSummary();
    } catch (err) {
      showMsg('Delete failed: ' + err.message, 'error');
    } finally {
      rcDeleteConfirm.disabled = false;
      rcDeleteConfirm.textContent = 'Delete';
    }
  });

  // ============== Filter Listeners ==============
  rcFilterTabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      rcFilterTabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      currentPage = 1;
      renderCodesTable();
    });
  });

  rcFilterValue.addEventListener('change', function() {
    currentValueFilter = rcFilterValue.value;
    currentPage = 1;
    renderCodesTable();
  });

  var searchTimer = null;
  rcSearchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function() {
      currentSearch = rcSearchInput.value.trim();
      currentPage = 1;
      renderCodesTable();
    }, 250);
  });

  rcRefreshBtn.addEventListener('click', function() {
    rcRefreshBtn.querySelector('svg').style.animation = 'spin 0.6s linear';
    setTimeout(function() { rcRefreshBtn.querySelector('svg').style.animation = ''; }, 600);
    loadAllCodes();
    loadStockSummary();
  });

  // ============== Export CSV ==============
  rcExportBtn.addEventListener('click', function() {
    var filtered = getFilteredCodes();
    if (filtered.length === 0) {
      showMsg('No codes to export. Adjust your filters.', 'error');
      return;
    }

    var headers = ['Code', 'Value', 'IsUsed', 'PurchasedBy', 'CreatedAt', 'PurchasedAt', 'BatchId', 'ExpiryDate'];
    var rows = [headers.join(',')];

    for (var i = 0; i < filtered.length; i++) {
      var c = filtered[i];
      var row = [
        '"' + (c.code || '') + '"',
        c.value || 0,
        c.isUsed ? 'Yes' : 'No',
        '"' + (c.purchasedBy || '') + '"',
        '"' + formatTimestamp(c.createdAt) + '"',
        '"' + formatTimestamp(c.purchasedAt) + '"',
        '"' + (c.batchId || '') + '"',
        '"' + (c.expiryDate ? formatTimestamp(c.expiryDate) : '') + '"'
      ];
      rows.push(row.join(','));
    }

    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var today = new Date();
    var p = function(n) { return String(n).padStart(2, '0'); };
    var dateStr = today.getFullYear() + '-' + p(today.getMonth() + 1) + '-' + p(today.getDate());
    a.href = url;
    a.download = 'edmfire-redeem-codes-' + dateStr + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMsg('Exported ' + filtered.length + ' codes to CSV.', 'success');
  });

  // ============== Utility ==============
  function escapeHtml(t) {
    if (t == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(t)));
    return d.innerHTML;
  }

  // Spin animation for refresh button
  var spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);

  // ============== Initial Load ==============
  loadStockSummary();
  loadAllCodes();
}
