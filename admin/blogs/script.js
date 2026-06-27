/* ============================================================
 * EDMFire Admin — Blogs / Announcement Manager
 *
 * Firestore Path: Announcement/{autoId}
 * Fields:
 *   - title        (String)
 *   - body         (String — preserves all whitespace, tabs, newlines exactly)
 *   - createdAt    (Timestamp — set once at creation, never modified)
 *   - lastUpdatedAt (Timestamp — set at creation, updated on every save)
 *
 * Modes:
 *   • CREATE — Save button creates a new doc with createdAt = lastUpdatedAt = now
 *   • UPDATE — Save button (after clicking "Update" on a list item) updates
 *              an existing doc's title+body and bumps lastUpdatedAt only
 *
 * Whitespace handling:
 *   - The <textarea> element natively preserves spaces, tabs, and newlines.
 *   - We read raw `.value` (NO trim, NO normalization) and write it as-is
 *     to Firestore. Firestore stores UTF-8 strings verbatim.
 *   - On update-load, we set `textarea.value = doc.body` — browser restores
 *     the EXACT same whitespace the admin originally typed.
 * ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initAuthGuard === 'function') {
    initAuthGuard(function(user) {
      initBlogsUI(user);
    });
  } else {
    initBlogsUI(null);
  }
  if (typeof initCommonUI === 'function') initCommonUI();
});

function initBlogsUI(adminUser) {
  'use strict';

  // ============== State ==============
  var db = firebase.firestore();
  var BLOGS_REF = db.collection('Announcement');

  var allBlogs = [];         // full cache from Firestore
  var currentSearch = '';
  var editingId = null;      // null = CREATE mode, string = UPDATE mode

  // ============== Elements ==============
  var bgTitle = document.getElementById('bgTitle');
  var bgBody = document.getElementById('bgBody');
  var bgTitleCount = document.getElementById('bgTitleCount');
  var bgBodyCount = document.getElementById('bgBodyCount');
  var bgBodyLines = document.getElementById('bgBodyLines');
  var bgSaveBtn = document.getElementById('bgSaveBtn');
  var bgCancelBtn = document.getElementById('bgCancelBtn');
  var bgClearBtn = document.getElementById('bgClearBtn');
  var bgFormTitle = document.getElementById('bgFormTitle');
  var bgFormSubtitle = document.getElementById('bgFormSubtitle');
  var bgResultMsg = document.getElementById('bgResultMsg');

  var bgSearchInput = document.getElementById('bgSearchInput');
  var bgRefreshBtn = document.getElementById('bgRefreshBtn');
  var bgListCount = document.getElementById('bgListCount');
  var bgList = document.getElementById('bgList');

  // ============== Helpers ==============
  function showMsg(text, type) {
    bgResultMsg.textContent = text;
    bgResultMsg.className = 'bg-result-msg ' + type;
    if (type === 'success' || type === 'info') {
      setTimeout(function() {
        bgResultMsg.className = 'bg-result-msg';
      }, 6000);
    }
  }

  function escapeHtml(t) {
    if (t == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(t)));
    return d.innerHTML;
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
    if (!str) return '';
    // Collapse newlines/tabs to single spaces for the one-line preview ONLY.
    // The full body is preserved exactly in Firestore and in the textarea.
    var flat = str.replace(/\s+/g, ' ').trim();
    return flat.length > n ? flat.substring(0, n) + '…' : flat;
  }

  // ============== Char Counters ==============
  function updateCounters() {
    bgTitleCount.textContent = bgTitle.value.length;
    bgBodyCount.textContent = bgBody.value.length;
    // Count lines: split by \n. Empty body = 0 lines.
    var bodyVal = bgBody.value;
    var lineCount = bodyVal.length === 0 ? 0 : bodyVal.split('\n').length;
    bgBodyLines.textContent = lineCount;

    // Enable/disable Save button — need non-empty title AND non-empty body
    // NOTE: We intentionally do NOT trim — the admin may want leading
    // whitespace as part of the content. We only check length > 0.
    var titleHasContent = bgTitle.value.length > 0;
    var bodyHasContent = bgBody.value.length > 0;
    bgSaveBtn.disabled = !(titleHasContent && bodyHasContent);
  }

  bgTitle.addEventListener('input', updateCounters);
  bgBody.addEventListener('input', updateCounters);

  // ============== Mode Switching ==============
  function setCreateMode() {
    editingId = null;
    bgFormTitle.textContent = '➕ Create New Blog';
    bgFormSubtitle.textContent = 'Fill in title and body, then click Save. All spaces, tabs, and line breaks are preserved exactly.';
    bgSaveBtn.classList.remove('is-update');
    bgSaveBtn.querySelector('span').textContent = 'Save Blog';
    bgCancelBtn.style.display = 'none';
  }

  function setUpdateMode(blogId, title) {
    editingId = blogId;
    bgFormTitle.textContent = '✏️ Updating: ' + truncate(title, 50);
    bgFormSubtitle.textContent = 'Editing existing blog. Click Save Blog to update lastUpdatedAt. Click Cancel Edit to discard changes.';
    bgSaveBtn.classList.add('is-update');
    bgSaveBtn.querySelector('span').textContent = 'Update Blog';
    bgCancelBtn.style.display = 'inline-flex';
  }

  // ============== Save (Create + Update) ==============
  bgSaveBtn.addEventListener('click', async function() {
    // Read raw values — NO trim. Whitespace is part of the content.
    var titleVal = bgTitle.value;
    var bodyVal = bgBody.value;

    // Basic non-empty check (we allow leading/trailing whitespace inside content)
    if (titleVal.length === 0 || bodyVal.length === 0) {
      showMsg('Both Title and Body are required.', 'error');
      return;
    }

    // Disable button during save
    bgSaveBtn.disabled = true;
    var originalLabel = bgSaveBtn.querySelector('span').textContent;
    bgSaveBtn.querySelector('span').textContent = 'Saving...';

    try {
      if (editingId === null) {
        // ============== CREATE MODE ==============
        var now = firebase.firestore.FieldValue.serverTimestamp();
        var newDocRef = BLOGS_REF.doc(); // auto-generated ID

        var newData = {
          title: titleVal,
          body: bodyVal,
          createdAt: now,
          lastUpdatedAt: now
        };

        await newDocRef.set(newData);

        console.log('[Blogs] Created new blog:', newDocRef.id,
                    '| title length:', titleVal.length,
                    '| body length:', bodyVal.length,
                    '| body lines:', bodyVal.split('\n').length);
        showMsg('✅ Blog created successfully! ID: ' + newDocRef.id, 'success');

      } else {
        // ============== UPDATE MODE ==============
        var updateData = {
          title: titleVal,
          body: bodyVal,
          lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          // NOTE: createdAt is NOT touched — preserved as-is
        };

        await BLOGS_REF.doc(editingId).update(updateData);

        console.log('[Blogs] Updated blog:', editingId,
                    '| title length:', titleVal.length,
                    '| body length:', bodyVal.length,
                    '| body lines:', bodyVal.split('\n').length);
        showMsg('✅ Blog updated successfully! ID: ' + editingId, 'success');
      }

      // Reset form to CREATE mode + reload list
      bgTitle.value = '';
      bgBody.value = '';
      setCreateMode();
      updateCounters();
      loadBlogs();

      // Scroll to top so admin sees the success message
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[Blogs] Save error:', err);
      showMsg('Failed to save blog: ' + err.message, 'error');
    } finally {
      bgSaveBtn.disabled = false;
      bgSaveBtn.querySelector('span').textContent = originalLabel;
      // Re-validate button state
      updateCounters();
    }
  });

  // ============== Cancel Edit ==============
  bgCancelBtn.addEventListener('click', function() {
    bgTitle.value = '';
    bgBody.value = '';
    setCreateMode();
    updateCounters();
    showMsg('Edit cancelled. Form cleared.', 'info');
    renderBlogsList(); // un-highlight the previously-editing item
  });

  // ============== Clear Form ==============
  bgClearBtn.addEventListener('click', function() {
    if (bgTitle.value.length === 0 && bgBody.value.length === 0 && editingId === null) {
      return; // nothing to clear
    }
    if (!confirm('Clear the form? Any unsaved changes will be lost.')) return;
    bgTitle.value = '';
    bgBody.value = '';
    setCreateMode();
    updateCounters();
    bgResultMsg.className = 'bg-result-msg';
    renderBlogsList();
  });

  // ============== Load All Blogs ==============
  async function loadBlogs() {
    try {
      bgListCount.textContent = 'Loading...';
      bgList.innerHTML = '<div class="bg-list-empty">Loading...</div>';

      // Order by createdAt desc (newest first)
      var snapshot = await BLOGS_REF.orderBy('createdAt', 'desc').limit(500).get();

      allBlogs = [];
      snapshot.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        allBlogs.push(d);
      });

      renderBlogsList();
    } catch (err) {
      console.error('[Blogs] Load error:', err);
      bgList.innerHTML = '<div class="bg-list-empty">Error loading blogs: ' + escapeHtml(err.message) + '</div>';
      bgListCount.textContent = 'Error';
    }
  }

  // ============== Render Blogs List ==============
  function renderBlogsList() {
    // Filter by search query (case-insensitive on title only)
    var filtered = allBlogs;
    if (currentSearch) {
      var q = currentSearch.toLowerCase();
      filtered = allBlogs.filter(function(b) {
        return b.title && b.title.toLowerCase().indexOf(q) >= 0;
      });
    }

    bgListCount.textContent = filtered.length + ' blog' + (filtered.length === 1 ? '' : 's') +
                              (allBlogs.length !== filtered.length ? ' (of ' + allBlogs.length + ' total)' : '');

    if (filtered.length === 0) {
      bgList.innerHTML = '<div class="bg-list-empty">' +
        (allBlogs.length === 0
          ? 'No blogs yet. Create your first blog using the form above.'
          : 'No blogs match your search.') +
        '</div>';
      return;
    }

    bgList.innerHTML = '';
    for (var i = 0; i < filtered.length; i++) {
      (function(idx, blog) {
        var isEditing = (editingId === blog._id);

        var item = document.createElement('div');
        item.className = 'bg-item' + (isEditing ? ' is-editing' : '');
        item.setAttribute('data-id', blog._id);

        // Serial number
        var num = document.createElement('div');
        num.className = 'bg-item-num';
        num.textContent = '#' + (idx + 1);

        // Main content (title + meta)
        var main = document.createElement('div');
        main.className = 'bg-item-main';

        var titleEl = document.createElement('div');
        titleEl.className = 'bg-item-title';
        titleEl.textContent = blog.title || '(untitled)';
        titleEl.title = blog.title || '';
        main.appendChild(titleEl);

        var metaEl = document.createElement('div');
        metaEl.className = 'bg-item-meta';
        var createdAtStr = formatTimestamp(blog.createdAt);
        var updatedStr = formatTimestamp(blog.lastUpdatedAt);
        var isModified = blog.lastUpdatedAt && blog.createdAt &&
                         blog.lastUpdatedAt.toMillis &&
                         blog.createdAt.toMillis &&
                         blog.lastUpdatedAt.toMillis() !== blog.createdAt.toMillis();
        metaEl.innerHTML =
          '<span class="bg-meta-strong">Created:</span> ' + escapeHtml(createdAtStr) +
          ' · <span class="bg-meta-strong">Updated:</span> ' + escapeHtml(updatedStr) +
          (isModified ? ' <span class="bg-meta-changed">● modified</span>' : '');
        main.appendChild(metaEl);

        // Optional body preview (first line / first 80 chars collapsed)
        if (blog.body && blog.body.length > 0) {
          var preview = document.createElement('div');
          preview.className = 'bg-item-body-preview';
          preview.textContent = 'Preview: ' + truncate(blog.body, 80);
          main.appendChild(preview);
        }

        // Action button — Update or "Editing..." badge
        var actionEl;
        if (isEditing) {
          actionEl = document.createElement('div');
          actionEl.className = 'bg-item-editing-badge';
          actionEl.innerHTML = '✏️ Editing...';
        } else {
          actionEl = document.createElement('button');
          actionEl.className = 'bg-item-update';
          actionEl.type = 'button';
          actionEl.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
            '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
            '</svg>' +
            '<span>Update</span>';
          actionEl.addEventListener('click', function() {
            loadBlogIntoForm(blog._id);
          });
        }

        item.appendChild(num);
        item.appendChild(main);
        item.appendChild(actionEl);

        bgList.appendChild(item);
      })(i, filtered[i]);
    }
  }

  // ============== Load Blog Into Form (for Update) ==============
  function loadBlogIntoForm(blogId) {
    // Find in cache (already loaded)
    var blog = null;
    for (var i = 0; i < allBlogs.length; i++) {
      if (allBlogs[i]._id === blogId) {
        blog = allBlogs[i];
        break;
      }
    }
    if (!blog) {
      showMsg('Blog not found in cache. Click Refresh and try again.', 'error');
      return;
    }

    // Set the form values EXACTLY as stored — no trim, no normalization.
    // textarea.value = X restores all whitespace (newlines, tabs, leading spaces).
    bgTitle.value = blog.title || '';
    bgBody.value = blog.body || '';

    setUpdateMode(blogId, blog.title || '(untitled)');
    updateCounters();
    renderBlogsList(); // highlight the editing item

    // Scroll to the form so admin can edit immediately
    var formCard = bgSaveBtn.closest('.bg-card');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showMsg('Loaded blog for editing. Make changes and click "Update Blog".', 'info');
  }

  // ============== Search ==============
  var searchTimer = null;
  bgSearchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function() {
      currentSearch = bgSearchInput.value.trim();
      renderBlogsList();
    }, 200);
  });

  // ============== Refresh ==============
  bgRefreshBtn.addEventListener('click', function() {
    var svg = bgRefreshBtn.querySelector('svg');
    if (svg) {
      svg.style.animation = 'bg-spin 0.6s linear';
      setTimeout(function() { svg.style.animation = ''; }, 600);
    }
    loadBlogs();
  });

  // Spin keyframe (scoped name to avoid clashing with other pages)
  var spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes bg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);

  // ============== Initial Load ==============
  setCreateMode();
  updateCounters();
  loadBlogs();
}
