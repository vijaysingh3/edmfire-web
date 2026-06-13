// ============================================
// EDMFire Admin - Users Management Logic
// ============================================

var searchInput = document.getElementById("searchInput");
var searchResults = document.getElementById("searchResults");
var totalUsersCount = document.getElementById("totalUsersCount");

// ========== LOAD TOTAL USERS COUNT ==========
function loadTotalUsersCount() {
  var db = firebase.firestore();
  db.collection("TotalUsers").doc("count").get().then(function(doc) {
    if (doc.exists) {
      var data = doc.data();
      if (totalUsersCount) totalUsersCount.textContent = data.totalCount || 0;
    }
  }).catch(function(err) {
    console.error("TotalUsers count error:", err);
  });
}

// ========== SEARCH USERS ==========
function searchUsers() {
  var query = searchInput.value.trim();
  if (!query) {
    searchResults.innerHTML =
      '<div class="results-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<p>Enter a UID, Email or InGameUID to search</p>' +
      '</div>';
    return;
  }

  // Show loading
  searchResults.innerHTML =
    '<div class="results-loading">' +
      '<div class="detail-loading-spinner"></div>' +
      '<span>Searching...</span>' +
    '</div>';

  var db = firebase.firestore();

  // Check if query looks like an email (has @ symbol)
  if (query.indexOf("@") !== -1) {
    // Search by email
    searchByEmail(query);
  } else {
    // Try as UID first — direct document lookup
    db.collection("Users").doc(query).get().then(function(doc) {
      if (doc.exists) {
        renderResults([{ id: doc.id, data: doc.data() }]);
      } else {
        // Try InGameUID search next
        searchByInGameUID(query);
      }
    }).catch(function(err) {
      console.error("UID search error:", err);
      // Try InGameUID search as fallback
      searchByInGameUID(query);
    });
  }
}

// ========== SEARCH BY EMAIL ==========
function searchByEmail(email) {
  var db = firebase.firestore();
  db.collection("Users").where("email", "==", email).get().then(function(snapshot) {
    if (snapshot.empty) {
      searchResults.innerHTML =
        '<div class="results-empty">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
          '<p>No user found with this email</p>' +
        '</div>';
      return;
    }

    var results = [];
    snapshot.forEach(function(doc) {
      results.push({ id: doc.id, data: doc.data() });
    });
    renderResults(results);
  }).catch(function(err) {
    searchResults.innerHTML =
      '<div class="results-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<p>Search error: ' + escapeHtml(err.message) + '</p>' +
      '</div>';
  });
}

// ========== SEARCH BY InGameUID ==========
function searchByInGameUID(inGameUID) {
  var db = firebase.firestore();
  db.collection("Users").where("InGameUID", "==", inGameUID).get().then(function(snapshot) {
    if (snapshot.empty) {
      // No match by UID, Email or InGameUID — show not found
      searchResults.innerHTML =
        '<div class="results-empty">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
          '<p>No user found with this UID, Email or InGameUID</p>' +
        '</div>';
      return;
    }

    var results = [];
    snapshot.forEach(function(doc) {
      results.push({ id: doc.id, data: doc.data() });
    });
    renderResults(results);
  }).catch(function(err) {
    searchResults.innerHTML =
      '<div class="results-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<p>Search error: ' + escapeHtml(err.message) + '</p>' +
      '</div>';
  });
}

// ========== RENDER SEARCH RESULTS ==========
function renderResults(results) {
  var html = "";

  for (var i = 0; i < results.length; i++) {
    var uid = results[i].id;
    var data = results[i].data;
    var userName = escapeHtml(data.UserName || data.username || "Unknown");
    var email = escapeHtml(data.email || "No email");
    var inGameUID = escapeHtml(data.InGameUID || "");
    var accountStatus = data.AccountStatus || "Active";
    var statusClass = accountStatus === "Active" ? "active" : "banned";
    var initial = userName.charAt(0).toUpperCase();

    html += '<div class="user-result-card">';
    html += '<div class="user-result-top">';
    html += '<div class="user-result-avatar">' + initial + '</div>';
    html += '<div class="user-result-info">';
    html += '<div class="user-result-name">' + userName + '</div>';
    html += '<div class="user-result-email">' + email + '</div>';
    if (inGameUID) {
      html += '<div class="user-result-ingame" style="font-size:12px;color:#9ca3af;margin-top:2px;">InGameUID: <span style="color:#7c6cf0;">' + inGameUID + '</span></div>';
    }
    html += '</div>';
    html += '<span class="user-result-status ' + statusClass + '">' + escapeHtml(accountStatus) + '</span>';
    html += '</div>';
    html += '<div class="user-result-uid">UID: <span class="uid-text">' + escapeHtml(uid) + '</span></div>';
    html += '<div class="user-result-actions">';
    html += '<a class="user-action-btn user-action-view" href="/admin/user-detail/?uid=' + encodeURIComponent(uid) + '">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    html += 'View Details</a>';
    html += '<a class="user-action-btn user-action-subcollection" href="/admin/user-detail/?uid=' + encodeURIComponent(uid) + '&tab=subcollections">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    html += 'View SubCollections</a>';
    html += '</div>';
    html += '</div>';
  }

  searchResults.innerHTML = html;
}

// ========== ENTER KEY SEARCH ==========
if (searchInput) {
  searchInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      searchUsers();
    }
  });
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadTotalUsersCount();
});
initCommonUI();
