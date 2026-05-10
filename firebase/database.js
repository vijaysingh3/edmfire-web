// Firebase Realtime Database helper functions

// users list load karna (realtime)
function loadUsers(callback) {
  firebase.database().ref("helpCenter/users").on("value", function(snapshot) {
    callback(snapshot.val());
  });
}

// users list sirf ek baar load karna
function loadUsersOnce() {
  return new Promise(function(resolve, reject) {
    firebase.database().ref("helpCenter/users").once("value", function(snapshot) {
      resolve(snapshot.val());
    }, reject);
  });
}

// messages load karna specific user ke (realtime)
function loadMessages(uid, callback) {
  firebase.database().ref("helpCenter/chats/" + uid).on("value", function(snapshot) {
    callback(snapshot.val());
  });
}

// messages sirf ek baar load karna
function loadMessagesOnce(uid) {
  return new Promise(function(resolve, reject) {
    firebase.database().ref("helpCenter/chats/" + uid).once("value", function(snapshot) {
      resolve(snapshot.val());
    }, reject);
  });
}

// message bhejna - incrementUnread independent hai (fail hone pe message save toh hoga)
function sendMessage(uid, sender, text, imageUrl, replyTo) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  var newMsg = {
    sender: sender,
    text: text || "",
    imageUrl: imageUrl || "",
    seen: false,
    timestamp: Date.now()
  };
  if (replyTo) {
    newMsg.replyTo = replyTo;
  }
  return ref.push(newMsg).then(function() {
    // unread increment - fire and forget (message already saved)
    if (sender === "user") {
      incrementUnread(uid);
    }
    return true;
  }).catch(function(error) {
    console.error("Send message error:", error);
    return false;
  });
}

// messages as seen mark karna
function markMessagesAsSeen(uid, readerRole) {
  var senderToMark = readerRole === "admin" ? "user" : "admin";
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  return ref.once("value").then(function(snapshot) {
    var data = snapshot.val();
    if (!data) return;
    var updates = {};
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (data[key].sender === senderToMark && data[key].seen === false) {
        updates[key + "/seen"] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      return ref.update(updates);
    }
  }).catch(function(error) {
    console.error("Mark seen error:", error);
  });
}

// specific message delete karna
function deleteMessage(uid, msgKey) {
  return firebase.database().ref("helpCenter/chats/" + uid + "/" + msgKey).remove()
    .catch(function(error) { console.error("Delete message error:", error); });
}

// FCM token save karna
function saveFcmToken(uid, token) {
  return firebase.database().ref("helpCenter/users/" + uid + "/fcmToken").set(token)
    .catch(function(error) { console.error("Save FCM token error:", error); });
}

// FCM token get karna
function getFcmToken(uid) {
  return new Promise(function(resolve, reject) {
    firebase.database().ref("helpCenter/users/" + uid + "/fcmToken").once("value", function(snapshot) {
      resolve(snapshot.val());
    }, reject);
  });
}

// unread count update karna
function updateUnread(uid, count) {
  return firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(count)
    .catch(function(error) { console.error("Update unread error:", error); });
}

// unread count increment karna
function incrementUnread(uid) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  return ref.once("value").then(function(snapshot) {
    var current = snapshot.val() || 0;
    return ref.set(current + 1);
  }).catch(function(error) {
    console.error("Increment unread error:", error);
  });
}

// unread count zero karna
function resetUnread(uid) {
  return firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(0)
    .catch(function(error) { console.error("Reset unread error:", error); });
}

// user register karna
function registerUser(uid, username) {
  return firebase.database().ref("helpCenter/users/" + uid).set({
    userId: uid,
    username: username,
    unreadMsg: 0,
    fcmToken: ""
  }).catch(function(error) { console.error("Register user error:", error); });
}

// realtime messages listener
function listenRealtimeMessages(uid, callback) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.on("child_added", function(snapshot) { callback(snapshot.key, snapshot.val()); });
  return ref;
}

// listener remove karna
function offMessagesListener(uid) {
  firebase.database().ref("helpCenter/chats/" + uid).off();
}