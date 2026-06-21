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
  var rcExpiry = document.getElementById('rcExpiry');
  var rcEntryList = document.getElementById('rcEntryList');
  var rcAddRowBtn = document.getElementById('rcAddRowBtn');
  var rcSaveBtn = document.getElementById('rcSaveBtn');
  var rcClearBtn = document.getElementById('rcClearBtn');
  var rcEntrySummary = document.getElementById('rcEntrySummary');
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

  // ============== Manual Code Entry System ==============
  // Each row has: code input + value dropdown + delete button
  // "+ Add Another Code" adds a new empty row
  // "Save All Codes" batch-writes all valid rows to Firestore

  var entryRows = []; // array of { code: '', value: 10 } — current state of entry list

  function renderEntryList() {
    rcEntryList.innerHTML = '';

    if (entryRows.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'rc-entry-empty';
      empty.textContent = 'No codes added yet. Click "Add Another Code" to start entering redeem codes.';
      rcEntryList.appendChild(empty);
      updateEntrySummary();
      return;
    }

    for (var i = 0; i < entryRows.length; i++) {
      (function(idx) {
        var row = document.createElement('div');
        row.className = 'rc-entry-row';

        // Row number
        var num = document.createElement('div');
        num.className = 'rc-row-num';
        num.textContent = '#' + (idx + 1);

        // Code input
        var codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.className = 'rc-row-code';
        codeInput.placeholder = 'Paste Google Play redeem code here...';
        codeInput.value = entryRows[idx].code || '';
        codeInput.maxLength = 100;
        codeInput.addEventListener('input', function() {
          entryRows[idx].code = codeInput.value.trim();
          updateEntrySummary();
        });

        // Value dropdown
        var valueSelect = document.createElement('select');
        valueSelect.className = 'rc-row-value';
        [10, 20, 30, 40, 50].forEach(function(v) {
          var opt = document.createElement('option');
          opt.value = v;
          opt.textContent = '₹' + v;
          valueSelect.appendChild(opt);
        });
        valueSelect.value = String(entryRows[idx].value || 10);
        valueSelect.addEventListener('change', function() {
          entryRows[idx].value = parseInt(valueSelect.value, 10);
          updateEntrySummary();
        });

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'rc-row-delete';
        delBtn.title = 'Remove this code';
        delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.addEventListener('click', function() {
          entryRows.splice(idx, 1);
          renderEntryList();
        });

        row.appendChild(num);
        row.appendChild(codeInput);
        row.appendChild(valueSelect);
        row.appendChild(delBtn);

        rcEntryList.appendChild(row);

        // Auto-focus the code input on freshly added rows
        if (entryRows[idx]._isNew) {
          entryRows[idx]._isNew = false;
          setTimeout(function() { codeInput.focus(); }, 50);
        }
      })(i);
    }

    updateEntrySummary();
  }

  function updateEntrySummary() {
    var valid = entryRows.filter(function(r) {
      return r.code && r.code.trim().length > 0;
    });
    var count = valid.length;
    rcEntrySummary.textContent = count + ' code' + (count === 1 ? '' : 's') + ' ready to save';
    if (count > 0) {
      rcEntrySummary.classList.add('has-items');
      rcSaveBtn.disabled = false;
    } else {
      rcEntrySummary.classList.remove('has-items');
      rcSaveBtn.disabled = true;
    }
  }

  function addNewRow() {
    // Cap at 200 rows to prevent UI slowdown
    if (entryRows.length >= 200) {
      showMsg('Maximum 200 codes per batch. Save current batch first.', 'error');
      return;
    }
    entryRows.push({ code: '', value: 10, _isNew: true });
    renderEntryList();
    // Scroll the new row into view
    setTimeout(function() {
      rcEntryList.scrollTop = rcEntryList.scrollHeight;
    }, 50);
  }

  rcAddRowBtn.addEventListener('click', addNewRow);

  // ============== Save All Codes ==============
  rcSaveBtn.addEventListener('click', async function() {
    // 1. Collect and validate
    var validRows = entryRows.filter(function(r) {
      return r.code && r.code.trim().length > 0;
    });

    if (validRows.length === 0) {
      showMsg('Please enter at least one redeem code before saving.', 'error');
      return;
    }

    // Normalize codes (uppercase, trim) and check for duplicates within this batch
    var seen = {};
    var duplicates = [];
    var cleanRows = [];
    for (var i = 0; i < validRows.length; i++) {
      var code = validRows[i].code.trim().toUpperCase();
      if (seen[code]) {
        duplicates.push(code);
        continue;
      }
      seen[code] = true;
      cleanRows.push({ code: code, value: validRows[i].value });
    }

    if (duplicates.length > 0) {
      showMsg('Duplicate codes in this batch removed: ' + duplicates.length + '. Saving ' + cleanRows.length + ' unique codes.', 'info');
    }

    if (cleanRows.length === 0) {
      showMsg('All entered codes are duplicates. Please enter unique codes.', 'error');
      return;
    }

    // 2. Get expiry (applies to all codes in this batch)
    var expiryRaw = rcExpiry.value;
    var expiryDate = null;
    if (expiryRaw) {
      expiryDate = firebase.firestore.Timestamp.fromDate(new Date(expiryRaw + 'T23:59:59'));
    }

    // 3. Save to Firestore
    rcSaveBtn.disabled = true;
    rcSaveBtn.querySelector('span').textContent = 'Saving...';
    showMsg('Saving ' + cleanRows.length + ' codes to Firestore...', 'info');

    try {
      var batchId = 'BATCH_' + Date.now();
      var createdAt = firebase.firestore.FieldValue.serverTimestamp();
      var batch = db.batch();
      var MAX_BATCH = 450; // Firestore batch limit is 500, keep buffer

      // If more than MAX_BATCH, write multiple batches sequentially
      var batchesWritten = 0;
      while (batchesWritten < cleanRows.length) {
        var chunkSize = Math.min(MAX_BATCH, cleanRows.length - batchesWritten);
        var chunkBatch = db.batch();

        for (var j = 0; j < chunkSize; j++) {
          var item = cleanRows[batchesWritten + j];
          var docRef = CODES_REF.doc();
          var data = {
            code: item.code,
            value: item.value,
            isUsed: false,
            purchasedBy: '',
            purchasedAt: null,
            createdAt: createdAt,
            createdBy: adminUid,
            batchId: batchId,
            expiryDate: expiryDate
          };
          chunkBatch.set(docRef, data);
        }

        await chunkBatch.commit();
        batchesWritten += chunkSize;
      }

      showMsg('✅ ' + cleanRows.length + ' codes saved successfully! Batch: ' + batchId, 'success');

      // Clear entry list + expiry
      entryRows = [];
      rcExpiry.value = '';
      renderEntryList();

      // Reload data
      loadAllCodes();
      loadStockSummary();
    } catch (err) {
      console.error('[RedeemCodes] Save error:', err);
      showMsg('Failed to save codes: ' + err.message, 'error');
    } finally {
      rcSaveBtn.disabled = false;
      rcSaveBtn.querySelector('span').textContent = 'Save All Codes';
      updateEntrySummary();
    }
  });

  rcClearBtn.addEventListener('click', function() {
    if (entryRows.length === 0) {
      rcExpiry.value = '';
      rcResultMsg.className = 'rc-result-msg';
      return;
    }
    if (confirm('Clear all entered codes? This cannot be undone.')) {
      entryRows = [];
      rcExpiry.value = '';
      rcResultMsg.className = 'rc-result-msg';
      renderEntryList();
    }
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
  renderEntryList();          // render empty entry list with placeholder
  loadStockSummary();
  loadAllCodes();
}
