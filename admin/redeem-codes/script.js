/* ============================================================
 * EDMFire Admin — Redeem Code Management
 * Firestore Path: RedeemCodes/{codeId}
 * Fields: code, value, isUsed, purchasedBy, purchasedAt,
 *         createdAt, createdBy, batchId, expiryDate
 *
 * 💰 PAYMENT RULE (Bank Method — follows app-wide rule):
 *   • Database Store : PAISA  (Integer)        e.g. 1000
 *   • UI Input       : RUPEES (Decimal allowed) e.g. 10, 10.5, 10.75
 *   • UI Display     : RUPEES (Decimal, trimmed) e.g. ₹10, ₹10.5, ₹10.75
 *   • Conversion     : paisa = round(rupees × 100)
 *                      rupees = paisa / 100.0
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
  var currentValueFilter = ''; // '' | '1000' | '2000' ... (paisa as string)
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

  // ============== Paisa / Rupees Helpers (Bank Rule) ==============
  // rupees (decimal, user input) → paisa (integer, db store)
  function rupeesToPaisa(rupees) {
    var n = parseFloat(rupees);
    if (isNaN(n) || n < 0) return 0;
    return Math.round(n * 100);
  }

  // paisa (integer from db) → display string in rupees, trimmed
  // 1000  -> "10"
  // 1050  -> "10.5"
  // 1075  -> "10.75"
  // 50    -> "0.5"
  function formatRupeesFromPaisa(paisa) {
    var p = parseInt(paisa, 10) || 0;
    var r = p / 100.0;
    if (r % 1 === 0) return String(Math.round(r));
    var s = r.toFixed(2);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function formatRupeesWithSymbol(paisa) {
    return '₹' + formatRupeesFromPaisa(paisa);
  }

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

  // ============== Manual Code Entry System (DOM-based) ==============
  // Each row is a self-contained DOM element with its own inputs.
  // State is read DIRECTLY from the DOM at save time — no separate state
  // array, no closure sync issues. This guarantees every row entered by
  // the admin is captured when "Save All Codes" is clicked.
  //
  // Each row: code input + ₹ amount input (decimal allowed) + delete button
  // "+ Add Another Code" appends a new empty row
  // "Save All Codes" batch-writes all valid rows to Firestore as PAISA

  var DEFAULT_VALUE_RUPEES = 10; // default ₹10 per new row (admin can change)
  var MAX_ROWS = 200;

  function showEmptyPlaceholder() {
    // Don't double-add
    if (document.getElementById('rcEntryEmpty')) return;
    var empty = document.createElement('div');
    empty.className = 'rc-entry-empty';
    empty.id = 'rcEntryEmpty';
    empty.textContent = 'No codes added yet. Click "Add Another Code" to start entering redeem codes.';
    rcEntryList.appendChild(empty);
  }

  function hideEmptyPlaceholder() {
    var existing = document.getElementById('rcEntryEmpty');
    if (existing) existing.remove();
  }

  function renumberRows() {
    var rows = rcEntryList.querySelectorAll('.rc-entry-row');
    for (var i = 0; i < rows.length; i++) {
      var num = rows[i].querySelector('.rc-row-num');
      if (num) num.textContent = '#' + (i + 1);
    }
  }

  function getRowCount() {
    return rcEntryList.querySelectorAll('.rc-entry-row').length;
  }

  // Read all rows directly from the DOM — this is the source of truth at save time.
  function getEntryRowsFromDOM() {
    var rows = rcEntryList.querySelectorAll('.rc-entry-row');
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var codeInput = rows[i].querySelector('.rc-row-code');
      var valueInput = rows[i].querySelector('.rc-row-value');
      var code = codeInput ? codeInput.value.trim() : '';
      var rawVal = valueInput ? valueInput.value : '';
      var valRupees = parseFloat(rawVal);
      result.push({
        code: code,
        valueRupees: (isNaN(valRupees) || valRupees < 0) ? 0 : valRupees,
        rawValue: rawVal
      });
    }
    return result;
  }

  function createEntryRow(initialCode, initialValueRupees, focusAfterCreate) {
    var row = document.createElement('div');
    row.className = 'rc-entry-row';

    // Row number (will be set by renumberRows)
    var num = document.createElement('div');
    num.className = 'rc-row-num';
    num.textContent = '#?';

    // Code input
    var codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.className = 'rc-row-code';
    codeInput.placeholder = 'Paste Google Play redeem code here...';
    codeInput.value = initialCode || '';
    codeInput.maxLength = 100;
    codeInput.addEventListener('input', updateEntrySummary);

    // Value input — number with decimal support (UI = RUPEES)
    var valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.className = 'rc-row-value';
    valueInput.placeholder = '₹ amount';
    valueInput.min = '0.01';
    valueInput.step = '0.01';
    valueInput.title = 'Enter amount in Rupees. Decimals allowed (e.g. 10, 10.5, 10.75). Stored as paisa.';
    valueInput.value = (initialValueRupees != null && !isNaN(initialValueRupees))
      ? initialValueRupees
      : DEFAULT_VALUE_RUPEES;
    valueInput.addEventListener('input', updateEntrySummary);

    // Delete button — removes this DOM row directly (no state to splice)
    var delBtn = document.createElement('button');
    delBtn.className = 'rc-row-delete';
    delBtn.title = 'Remove this code';
    delBtn.type = 'button';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    delBtn.addEventListener('click', function() {
      row.remove();
      renumberRows();
      if (getRowCount() === 0) showEmptyPlaceholder();
      updateEntrySummary();
    });

    row.appendChild(num);
    row.appendChild(codeInput);
    row.appendChild(valueInput);
    row.appendChild(delBtn);

    rcEntryList.appendChild(row);
    renumberRows();

    if (focusAfterCreate) {
      setTimeout(function() { codeInput.focus(); }, 50);
    }

    return row;
  }

  function updateEntrySummary() {
    var domRows = getEntryRowsFromDOM();
    var valid = domRows.filter(function(r) {
      return r.code && r.code.length > 0 && r.valueRupees > 0;
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
    if (getRowCount() >= MAX_ROWS) {
      showMsg('Maximum ' + MAX_ROWS + ' codes per batch. Save current batch first.', 'error');
      return;
    }
    hideEmptyPlaceholder();
    createEntryRow('', DEFAULT_VALUE_RUPEES, true);
    // Scroll the new row into view
    setTimeout(function() {
      rcEntryList.scrollTop = rcEntryList.scrollHeight;
    }, 50);
  }

  rcAddRowBtn.addEventListener('click', addNewRow);

  // Initial empty state
  showEmptyPlaceholder();
  updateEntrySummary();

  // ============== Save All Codes ==============
  rcSaveBtn.addEventListener('click', async function() {
    // 1. Read ALL rows directly from the DOM — no state sync, guaranteed fresh.
    var allRows = getEntryRowsFromDOM();

    // 2. Filter: need both code AND positive ₹ amount
    var validRows = allRows.filter(function(r) {
      return r.code && r.code.length > 0 && r.valueRupees > 0;
    });

    console.log('[RedeemCodes] Save click — total rows:', allRows.length,
                '| valid rows:', validRows.length);
    if (allRows.length > 0) {
      console.log('[RedeemCodes] Row dump:', allRows.map(function(r) {
        return { code: r.code, valueRupees: r.valueRupees, rawValue: r.rawValue };
      }));
    }

    if (validRows.length === 0) {
      showMsg('Please enter at least one redeem code with a valid ₹ amount before saving.', 'error');
      return;
    }

    // 3. Normalize codes (uppercase, trim) and dedupe within this batch
    var seen = {};
    var duplicates = [];
    var cleanRows = [];
    for (var i = 0; i < validRows.length; i++) {
      var code = validRows[i].code.toUpperCase();
      if (seen[code]) {
        duplicates.push(code);
        continue;
      }
      seen[code] = true;
      cleanRows.push({
        code: code,
        valuePaisa: rupeesToPaisa(validRows[i].valueRupees) // 🏦 STORE AS PAISA
      });
    }

    if (duplicates.length > 0) {
      showMsg('Duplicate codes in this batch removed: ' + duplicates.length + '. Saving ' + cleanRows.length + ' unique codes.', 'info');
    }

    if (cleanRows.length === 0) {
      showMsg('All entered codes are duplicates. Please enter unique codes.', 'error');
      return;
    }

    // 4. Get expiry (applies to all codes in this batch)
    var expiryRaw = rcExpiry.value;
    var expiryDate = null;
    if (expiryRaw) {
      expiryDate = firebase.firestore.Timestamp.fromDate(new Date(expiryRaw + 'T23:59:59'));
    }

    // 5. Save to Firestore
    rcSaveBtn.disabled = true;
    rcSaveBtn.querySelector('span').textContent = 'Saving...';
    showMsg('Saving ' + cleanRows.length + ' codes to Firestore...', 'info');

    try {
      var batchId = 'BATCH_' + Date.now();
      var createdAt = firebase.firestore.FieldValue.serverTimestamp();
      var MAX_BATCH = 450; // Firestore batch limit is 500, keep buffer

      var batchesWritten = 0;
      while (batchesWritten < cleanRows.length) {
        var chunkSize = Math.min(MAX_BATCH, cleanRows.length - batchesWritten);
        var chunkBatch = db.batch();

        for (var j = 0; j < chunkSize; j++) {
          var item = cleanRows[batchesWritten + j];
          var docRef = CODES_REF.doc();
          var data = {
            code: item.code,
            value: item.valuePaisa, // 🏦 PAISA (integer)
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

      console.log('[RedeemCodes] Save success — wrote', cleanRows.length,
                  'codes. Batch:', batchId);
      showMsg('✅ ' + cleanRows.length + ' codes saved successfully! Batch: ' + batchId, 'success');

      // Clear entry list + expiry
      rcEntryList.innerHTML = '';
      showEmptyPlaceholder();
      rcExpiry.value = '';
      updateEntrySummary();

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
    if (getRowCount() === 0) {
      rcExpiry.value = '';
      rcResultMsg.className = 'rc-result-msg';
      return;
    }
    if (confirm('Clear all entered codes? This cannot be undone.')) {
      rcEntryList.innerHTML = '';
      showEmptyPlaceholder();
      rcExpiry.value = '';
      rcResultMsg.className = 'rc-result-msg';
      updateEntrySummary();
    }
  });

  // ============== Load Stock Summary ==============
  async function loadStockSummary() {
    try {
      rcStockBody.innerHTML = '<tr><td colspan="6" class="rc-empty">Loading...</td></tr>';
      var snapshot = await CODES_REF.get();

      // Group by paisa value (as stored in DB)
      var stats = {}; // { paisa: { total, available, used } }

      var totalAll = 0, availableAll = 0, usedAll = 0, totalValuePaisa = 0;

      snapshot.forEach(function(doc) {
        var d = doc.data();
        var p = parseInt(d.value, 10) || 0; // 🏦 read paisa from db
        if (!stats[p]) stats[p] = { total: 0, available: 0, used: 0 };
        stats[p].total++;
        if (d.isUsed) {
          stats[p].used++;
          usedAll++;
        } else {
          stats[p].available++;
          availableAll++;
        }
        totalAll++;
        totalValuePaisa += p;
      });

      // Update top stat cards
      rcTotalCodes.textContent = totalAll;
      rcAvailable.textContent = availableAll;
      rcUsed.textContent = usedAll;
      rcTotalValue.textContent = formatRupeesWithSymbol(totalValuePaisa); // 🏦 show rupees

      // Render stock table (sorted by paisa ascending)
      rcStockBody.innerHTML = '';
      var hasRows = false;
      var sortedPaisa = Object.keys(stats).map(Number).sort(function(a, b) { return a - b; });

      for (var k = 0; k < sortedPaisa.length; k++) {
        var paisa = sortedPaisa[k];
        var s = stats[paisa];
        if (s.total === 0) continue;
        hasRows = true;
        var pctUsed = s.total > 0 ? Math.round((s.used / s.total) * 100) : 0;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="rc-value-cell">' + formatRupeesWithSymbol(paisa) + '</td>' +
          '<td>' + s.total + '</td>' +
          '<td style="color:#22c55e;font-weight:600;">' + s.available + '</td>' +
          '<td style="color:#ef4444;font-weight:600;">' + s.used + '</td>' +
          '<td>' + pctUsed + '%</td>' +
          '<td><div class="rc-progress-bar"><div class="rc-progress-fill" style="width:' + pctUsed + '%"></div></div></td>';
        rcStockBody.appendChild(tr);
      }

      if (!hasRows) {
        rcStockBody.innerHTML = '<tr><td colspan="6" class="rc-empty">No codes yet. Add some above.</td></tr>';
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
      // Value filter (paisa string comparison)
      if (currentValueFilter && String(parseInt(c.value, 10)) !== currentValueFilter) return false;
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
        '<td class="rc-value-cell">' + formatRupeesWithSymbol(c.value) + '</td>' + // 🏦 show rupees
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
    currentValueFilter = rcFilterValue.value; // '' or paisa-as-string e.g. '1000'
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

    var headers = ['Code', 'ValuePaisa', 'ValueRupees', 'IsUsed', 'PurchasedBy', 'CreatedAt', 'PurchasedAt', 'BatchId', 'ExpiryDate'];
    var rows = [headers.join(',')];

    for (var i = 0; i < filtered.length; i++) {
      var c = filtered[i];
      var row = [
        '"' + (c.code || '') + '"',
        parseInt(c.value, 10) || 0,                                  // 🏦 raw paisa
        formatRupeesFromPaisa(c.value),                              // 🏦 rupees (decimal, trimmed)
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
  // (entry list placeholder is initialized above inside the entry system block)
  loadStockSummary();
  loadAllCodes();
}
