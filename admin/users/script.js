// ============================================
// EDMFire Admin - Users Management Logic
// Search by UID (document ID), Email, or inGameUID
// Firestore path: Users/{userId}
// Field name variants checked: inGameUID, InGameUID, inGameUid, InGameUid
// Value types checked: string AND number (Firestore where is type-strict)
// ============================================

var searchInput = document.getElementById("searchInput");
var searchResults = document.getElementById("searchResults");
var totalUsersCount = document.getElementById("totalUsersCount");

// All possible field name variants for InGameUID
var INGAME_UID_FIELDS = ["inGameUID", "InGameUID", "inGameUid", "InGameUid", "gameUID", "GameUID", "gameUid", "GameUid"];

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

// ========== SHOW EMPTY STATE ==========
function showEmpty(message) {
  searchResults.innerHTML =
    '<div class="results-empty">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<p>' + escapeHtml(message) + '</p>' +
    '</div>';
}

// ========== SHOW ERROR STATE ==========
function showError(message) {
  searchResults.innerHTML =
    '<div class="results-empty">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<p>Search error: ' + escapeHtml(message) + '</p>' +
    '</div>';
}

// ========== DEDUPE RESULTS ==========
function dedupeResults(results) {
  var seen = {};
  var out = [];
  for (var i = 0; i < results.length; i++) {
    var uid = results[i].id;
    if (!seen[uid]) {
      seen[uid] = true;
      out.push(results[i]);
    }
  }
  return out;
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

  console.log("[USER-SEARCH] =========================================");
  console.log("[USER-SEARCH] Query:", query);

  // Show loading
  searchResults.innerHTML =
    '<div class="results-loading">' +
      '<div class="detail-loading-spinner"></div>' +
      '<span>Searching...</span>' +
    '</div>';

  var db = firebase.firestore();
  var hasAt = query.indexOf("@") !== -1;

  // Check if query is parseable as a number (for Firestore where type-strict matching)
  var queryAsNumber = null;
  if (/^\d+$/.test(query)) {
    queryAsNumber = parseInt(query, 10);
    console.log("[USER-SEARCH] Query is numeric, also trying as number:", queryAsNumber);
  }

  // All search promises to run in parallel
  var allPromises = [];

  // --- EMAIL search (only if @ is present) ---
  if (hasAt) {
    console.log("[USER-SEARCH] Query has @, searching by email...");
    allPromises.push(
      db.collection("Users").where("email", "==", query).get().then(function(snapshot) {
        console.log("[USER-SEARCH] Email matches:", snapshot.size);
        var results = [];
        snapshot.forEach(function(doc) {
          results.push({ id: doc.id, data: doc.data() });
        });
        return results;
      }).catch(function(err) {
        console.error("[USER-SEARCH] Email search error:", err.message);
        return [];
      })
    );
  } else {
    // --- UID document lookup ---
    console.log("[USER-SEARCH] Trying UID document lookup...");
    allPromises.push(
      db.collection("Users").doc(query).get().then(function(doc) {
        if (doc.exists) {
          console.log("[USER-SEARCH] UID match found:", doc.id);
          return [{ id: doc.id, data: doc.data() }];
        }
        console.log("[USER-SEARCH] No UID match");
        return [];
      }).catch(function(err) {
        console.error("[USER-SEARCH] UID lookup error:", err.message);
        return [];
      })
    );

    // --- InGameUID search (try ALL field name variants, as STRING) ---
    INGAME_UID_FIELDS.forEach(function(fieldName) {
      allPromises.push(
        db.collection("Users").where(fieldName, "==", query).get().then(function(snapshot) {
          if (snapshot.size > 0) {
            console.log("[USER-SEARCH] Field '" + fieldName + "' == string matches:", snapshot.size);
          }
          var results = [];
          snapshot.forEach(function(doc) {
            results.push({ id: doc.id, data: doc.data() });
          });
          return results;
        }).catch(function(err) {
          // Silent — likely field doesn't exist or needs index, don't spam console
          return [];
        })
      );
    });

    // --- InGameUID search (try ALL field name variants, as NUMBER) ---
    if (queryAsNumber !== null) {
      INGAME_UID_FIELDS.forEach(function(fieldName) {
        allPromises.push(
          db.collection("Users").where(fieldName, "==", queryAsNumber).get().then(function(snapshot) {
            if (snapshot.size > 0) {
              console.log("[USER-SEARCH] Field '" + fieldName + "' == number matches:", snapshot.size);
            }
            var results = [];
            snapshot.forEach(function(doc) {
              results.push({ id: doc.id, data: doc.data() });
            });
            return results;
          }).catch(function(err) {
            return [];
          })
        );
      });
    }

    // --- UserName exact match (string) ---
    allPromises.push(
      db.collection("Users").where("UserName", "==", query).get().then(function(snapshot) {
        if (snapshot.size > 0) {
          console.log("[USER-SEARCH] UserName matches:", snapshot.size);
        }
        var results = [];
        snapshot.forEach(function(doc) {
          results.push({ id: doc.id, data: doc.data() });
        });
        return results;
      }).catch(function(err) {
        return [];
      })
    );
  }

  // Wait for all searches to complete
  Promise.all(allPromises).then(function(arrays) {
    // Merge all results
    var all = [];
    arrays.forEach(function(arr) {
      arr.forEach(function(item) {
        all.push(item);
      });
    });

    console.log("[USER-SEARCH] Total merged results (before dedupe):", all.length);
    var results = dedupeResults(all);
    console.log("[USER-SEARCH] Final results (after dedupe):", results.length);

    if (results.length === 0) {
      // Show diagnostic info to help user understand why no results
      var hint = "No user found with this UID, Email or InGameUID";
      if (!hasAt && queryAsNumber !== null) {
        hint += " (tried as both string and number, all field variants)";
      }
      console.log("[USER-SEARCH] FAILED — checked fields:", INGAME_UID_FIELDS.join(", "), "and as number:", queryAsNumber);
      showEmpty(hint);
      return;
    }
    renderResults(results);
  }).catch(function(err) {
    console.error("[USER-SEARCH] Final merge error:", err);
    showError(err.message);
  });
}

// ========== RENDER SEARCH RESULTS ==========
function renderResults(results) {
  var html = "";

  for (var i = 0; i < results.length; i++) {
    var uid = results[i].id;
    var data = results[i].data;

    // Try multiple field name variants to read the inGameUID
    var inGameUIDRaw = "";
    for (var f = 0; f < INGAME_UID_FIELDS.length; f++) {
      if (data[INGAME_UID_FIELDS[f]] !== undefined && data[INGAME_UID_FIELDS[f]] !== null && data[INGAME_UID_FIELDS[f]] !== "") {
        inGameUIDRaw = data[INGAME_UID_FIELDS[f]];
        break;
      }
    }
    var inGameUID = escapeHtml(String(inGameUIDRaw || ""));

    var userName = escapeHtml(data.UserName || data.username || "Unknown");
    var email = escapeHtml(data.email || "No email");
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
