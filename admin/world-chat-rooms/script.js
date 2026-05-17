// ============================================
// EDMFire Admin - World Chat Rooms Management
// Create, view, delete daily chat rooms
// RTDB path: worldChat/rooms/{timestamp}, worldChat/meta/currentRoom
// ============================================

var currentRoomId = null;
var roomsData = {};
var confirmCallback = null;

// DOM
var activeRoomIdEl = document.getElementById("activeRoomId");
var activeRoomDateEl = document.getElementById("activeRoomDate");
var activeRoomMsgsEl = document.getElementById("activeRoomMsgs");
var activeRoomStatusEl = document.getElementById("activeRoomStatus");
var createRoomBtn = document.getElementById("createRoomBtn");
var roomsListEl = document.getElementById("roomsList");
var roomsCountEl = document.getElementById("roomsCount");
var bulkDeleteSection = document.getElementById("bulkDeleteSection");
var bulkDeleteDateEl = document.getElementById("bulkDeleteDate");
var bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
var confirmDialog = document.getElementById("confirmDialog");
var confirmOverlay = document.getElementById("confirmOverlay");
var confirmTitle = document.getElementById("confirmTitle");
var confirmMessage = document.getElementById("confirmMessage");
var confirmCancel = document.getElementById("confirmCancel");
var confirmOk = document.getElementById("confirmOk");
var toastEl = document.getElementById("toast");
var toastTextEl = document.getElementById("toastText");

console.log("[WC-ROOMS] Script loaded");

// ============ HELPERS ============

function formatRoomDate(timestampStr) {
  var ts = parseInt(timestampStr);
  if (isNaN(ts)) return "Unknown";
  var d = new Date(ts);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", 00:00 UTC";
}

function formatRoomId(timestampStr) {
  // Show shortened but readable: "1745280000000" -> "1745280..."
  if (timestampStr.length > 10) return timestampStr.substring(0, 8) + "...";
  return timestampStr;
}

function getTodayStart() {
  return Math.floor(Date.now() / 86400000) * 86400000;
}

function showToast(message, duration) {
  if (!toastEl || !toastTextEl) return;
  toastTextEl.textContent = message;
  toastEl.style.display = "block";
  setTimeout(function() {
    toastEl.style.display = "none";
  }, duration || 3000);
}

function showConfirm(title, message, callback) {
  confirmCallback = callback;
  if (confirmTitle) confirmTitle.textContent = title;
  if (confirmMessage) confirmMessage.textContent = message;
  if (confirmDialog) confirmDialog.style.display = "flex";
}

function hideConfirm() {
  if (confirmDialog) confirmDialog.style.display = "none";
  confirmCallback = null;
}

if (confirmCancel) confirmCancel.addEventListener("click", hideConfirm);
if (confirmOverlay) confirmOverlay.addEventListener("click", hideConfirm);

if (confirmOk) {
  confirmOk.addEventListener("click", function() {
    if (confirmCallback) confirmCallback();
    hideConfirm();
  });
}

// ============ LOAD CURRENT ROOM ============

function loadCurrentRoom() {
  var metaRef = firebase.database().ref("worldChat/meta/currentRoom");

  metaRef.on("value", function(snapshot) {
    var roomId = snapshot.val();
    currentRoomId = roomId;

    if (roomId) {
      if (activeRoomIdEl) activeRoomIdEl.textContent = formatRoomId(String(roomId));
      if (activeRoomDateEl) activeRoomDateEl.textContent = formatRoomDate(String(roomId));
      if (activeRoomStatusEl) {
        activeRoomStatusEl.textContent = "Active";
        activeRoomStatusEl.className = "room-info-value room-status-active";
      }

      // Get message count for current room
      var roomRef = firebase.database().ref("worldChat/rooms/" + roomId);
      roomRef.once("value", function(roomSnap) {
        var data = roomSnap.val();
        var count = data ? Object.keys(data).length : 0;
        if (activeRoomMsgsEl) activeRoomMsgsEl.textContent = count + " messages";
      });
    } else {
      if (activeRoomIdEl) activeRoomIdEl.textContent = "No room created";
      if (activeRoomDateEl) activeRoomDateEl.textContent = "--";
      if (activeRoomMsgsEl) activeRoomMsgsEl.textContent = "--";
      if (activeRoomStatusEl) {
        activeRoomStatusEl.textContent = "No active room";
        activeRoomStatusEl.className = "room-info-value";
        activeRoomStatusEl.style.color = "#f59e0b";
      }
    }

    // Reload rooms list to update active badges
    loadRoomsList();
  }, function(error) {
    console.error("[WC-ROOMS] Meta read error:", error);
  });
}

// ============ LOAD ALL ROOMS ============

function loadRoomsList() {
  var roomsRef = firebase.database().ref("worldChat/rooms");

  roomsRef.once("value", function(snapshot) {
    var data = snapshot.val();
    roomsData = data || {};

    var roomKeys = Object.keys(roomsData).sort(function(a, b) {
      return parseInt(b) - parseInt(a); // Newest first
    });

    if (roomsCountEl) roomsCountEl.textContent = roomKeys.length + " rooms";

    if (roomKeys.length === 0) {
      if (roomsListEl) {
        roomsListEl.innerHTML = '<div class="no-rooms"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><p>No chat rooms yet. Create one to get started!</p></div>';
      }
      if (bulkDeleteSection) bulkDeleteSection.style.display = "none";
      return;
    }

    // Show bulk delete section if there are rooms
    if (bulkDeleteSection) bulkDeleteSection.style.display = "block";

    // Build rooms list HTML
    var html = "";
    for (var i = 0; i < roomKeys.length; i++) {
      var roomId = roomKeys[i];
      var roomData = roomsData[roomId];
      var msgCount = roomData ? Object.keys(roomData).length : 0;
      var isActive = String(roomId) === String(currentRoomId);

      html += '<div class="room-item' + (isActive ? ' active-room' : '') + '">';
      html += '  <div class="room-icon">';
      html += '    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      html += '  </div>';
      html += '  <div class="room-details">';
      html += '    <div class="room-id">' + formatRoomId(String(roomId)) + '</div>';
      html += '    <div class="room-date">' + formatRoomDate(String(roomId)) + '</div>';
      html += '  </div>';
      html += '  <div class="room-meta">';
      html += '    <span class="room-msgs-badge">' + msgCount + ' msgs</span>';
      if (isActive) {
        html += '    <span class="room-active-badge">Active</span>';
      }
      html += '  </div>';
      html += '  <div class="room-actions">';
      if (!isActive) {
        html += '    <button class="room-action-btn set-active" data-room="' + roomId + '" title="Set this room as active">';
        html += '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        html += '      Set Active';
        html += '    </button>';
      }
      html += '    <button class="room-action-btn delete-btn" data-room="' + roomId + '" data-active="' + isActive + '" title="Delete this room">';
      html += '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      html += '      Delete';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';
    }

    if (roomsListEl) roomsListEl.innerHTML = html;

    // Bind action buttons
    bindRoomActions();

  }, function(error) {
    console.error("[WC-ROOMS] Rooms list error:", error);
    if (roomsListEl) {
      roomsListEl.innerHTML = '<div class="empty-placeholder" style="color:#f87171;">Error loading rooms: ' + error.message + '</div>';
    }
  });
}

// ============ BIND ROOM ACTION BUTTONS ============

function bindRoomActions() {
  // Set Active buttons
  var setActiveBtns = document.querySelectorAll(".set-active");
  for (var i = 0; i < setActiveBtns.length; i++) {
    setActiveBtns[i].addEventListener("click", function() {
      var roomId = this.getAttribute("data-room");
      if (!roomId) return;

      showConfirm(
        "Set Active Room?",
        "All users will see this room as the current chat room. Room: " + formatRoomDate(roomId),
        function() {
          firebase.database().ref("worldChat/meta/currentRoom").set(parseInt(roomId), function(error) {
            if (error) {
              showToast("Failed to set active room: " + error.message);
            } else {
              showToast("Room set as active successfully!");
            }
          });
        }
      );
    });
  }

  // Delete buttons
  var deleteBtns = document.querySelectorAll(".delete-btn");
  for (var i = 0; i < deleteBtns.length; i++) {
    deleteBtns[i].addEventListener("click", function() {
      var roomId = this.getAttribute("data-room");
      var isActive = this.getAttribute("data-active") === "true";
      if (!roomId) return;

      if (isActive) {
        showToast("Cannot delete the active room! Set another room as active first.");
        return;
      }

      showConfirm(
        "Delete Room?",
        "This will permanently delete room " + formatRoomDate(roomId) + " and all its messages. This cannot be undone.",
        function() {
          firebase.database().ref("worldChat/rooms/" + roomId).remove(function(error) {
            if (error) {
              showToast("Failed to delete room: " + error.message);
            } else {
              showToast("Room deleted successfully!");
              loadRoomsList();
            }
          });
        }
      );
    });
  }
}

// ============ CREATE NEW ROOM ============

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", function() {
    var todayStart = getTodayStart();

    // Check if today's room already exists
    if (String(currentRoomId) === String(todayStart)) {
      showToast("Today's room is already active!");
      return;
    }

    showConfirm(
      "Create New Room for Today?",
      "A new chat room will be created for today. The current room will become read-only for users. Room ID: " + todayStart,
      function() {
        createRoomBtn.disabled = true;

        // Create empty room node
        var updates = {};
        updates["worldChat/rooms/" + todayStart] = {};
        updates["worldChat/meta/currentRoom"] = todayStart;

        firebase.database().ref().update(updates, function(error) {
          createRoomBtn.disabled = false;
          if (error) {
            showToast("Failed to create room: " + error.message);
            console.error("[WC-ROOMS] Create room error:", error);
          } else {
            showToast("New room created for today!");
            console.log("[WC-ROOMS] Room created:", todayStart);
          }
        });
      }
    );
  });
}

// ============ BULK DELETE OLD ROOMS ============

if (bulkDeleteBtn) {
  bulkDeleteBtn.addEventListener("click", function() {
    var dateVal = bulkDeleteDateEl ? bulkDeleteDateEl.value : "";
    if (!dateVal) {
      showToast("Please select a date first.");
      return;
    }

    // Convert date to timestamp (UTC midnight)
    var selectedDate = new Date(dateVal + "T00:00:00Z");
    var beforeTimestamp = selectedDate.getTime();

    if (isNaN(beforeTimestamp)) {
      showToast("Invalid date selected.");
      return;
    }

    // Find rooms to delete
    var roomKeys = Object.keys(roomsData);
    var toDelete = [];

    for (var i = 0; i < roomKeys.length; i++) {
      var roomId = parseInt(roomKeys[i]);
      // Skip active room
      if (String(roomKeys[i]) === String(currentRoomId)) continue;
      // Room created before selected date
      if (roomId < beforeTimestamp) {
        toDelete.push(roomKeys[i]);
      }
    }

    if (toDelete.length === 0) {
      showToast("No rooms found before " + dateVal + " to delete.");
      return;
    }

    showConfirm(
      "Delete " + toDelete.length + " Old Rooms?",
      "This will permanently delete " + toDelete.length + " room(s) created before " + dateVal + " and all their messages. The active room will NOT be deleted. This cannot be undone.",
      function() {
        bulkDeleteBtn.disabled = true;
        var updates = {};

        for (var i = 0; i < toDelete.length; i++) {
          updates["worldChat/rooms/" + toDelete[i]] = null;
        }

        firebase.database().ref().update(updates, function(error) {
          bulkDeleteBtn.disabled = false;
          if (error) {
            showToast("Bulk delete failed: " + error.message);
          } else {
            showToast(toDelete.length + " room(s) deleted successfully!");
            loadRoomsList();
          }
        });
      }
    );
  });
}

// ============ INIT ============

initAuthGuard(function(user) {
  console.log("[WC-ROOMS] Admin authenticated, loading rooms...");
  loadCurrentRoom();
});

initCommonUI();
