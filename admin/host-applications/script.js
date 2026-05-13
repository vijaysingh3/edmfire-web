// ============================================
// EDMFire Admin - Host Applications Logic
// ============================================

var appsList = document.getElementById("appsList");
var appsTotalCount = document.getElementById("appsTotalCount");
var appsPendingCount = document.getElementById("appsPendingCount");
var appsApprovedCount = document.getElementById("appsApprovedCount");
var appsRejectedCount = document.getElementById("appsRejectedCount");

// Load all applications from Firestore
function loadApplications() {
  if (!firebase.firestore) {
    appsList.innerHTML = '<div class="apps-empty"><p>Firestore not available</p></div>';
    return;
  }

  var db = firebase.firestore();
  db.collection("applications").orderBy("createdAt", "desc").get().then(function(snapshot) {
    if (snapshot.empty) {
      appsList.innerHTML =
        '<div class="apps-empty">' +
          '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
          '<h2>No Applications Yet</h2>' +
          '<p>Host applications will appear here when submitted</p>' +
        '</div>';
      return;
    }

    var pending = 0, approved = 0, rejected = 0;
    var html = "";

    snapshot.forEach(function(doc) {
      var data = doc.data();
      var status = (data.status || "pending").toLowerCase();
      if (status === "pending") pending++;
      else if (status === "approved") approved++;
      else if (status === "rejected") rejected++;

      var initial = (data.fullName || "U").charAt(0).toUpperCase();
      var name = escapeHtml(data.fullName || "Unknown");
      var age = data.age || "-";
      var gender = data.gender || "-";
      var mobile = data.mobile || "-";
      var gmail = data.gmail || "-";
      var state = data.state || "-";
      var gameMode = data.gameModes === "br" ? "Battle Royale" : data.gameModes === "cs" ? "Clash Squad" : (data.gameModes || "-");
      var docId = doc.id;

      html +=
        '<a class="app-card" href="/admin/application-detail/?id=' + encodeURIComponent(docId) + '">' +
          '<div class="app-card-avatar">' + initial + '</div>' +
          '<div class="app-card-info">' +
            '<div class="app-card-name">' + name + '</div>' +
            '<div class="app-card-details">' +
              '<span class="app-card-detail">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                age + ' yrs, ' + gender +
              '</span>' +
              '<span class="app-card-detail">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
                mobile +
              '</span>' +
              '<span class="app-card-detail">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' +
                gmail +
              '</span>' +
              '<span class="app-card-detail">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
                state +
              '</span>' +
            '</div>' +
          '</div>' +
          '<span class="app-card-status ' + status + '">' + status + '</span>' +
          '<svg class="app-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</a>';
    });

    appsList.innerHTML = html;

    // Update stats
    if (appsTotalCount) appsTotalCount.textContent = snapshot.size;
    if (appsPendingCount) appsPendingCount.textContent = pending;
    if (appsApprovedCount) appsApprovedCount.textContent = approved;
    if (appsRejectedCount) appsRejectedCount.textContent = rejected;

  }).catch(function(error) {
    console.error("Load applications error:", error);
    appsList.innerHTML =
      '<div class="apps-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<h2>Error Loading</h2>' +
        '<p>' + escapeHtml(error.message) + '</p>' +
      '</div>';
  });
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadApplications();
});
initCommonUI();
