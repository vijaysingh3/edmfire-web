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

// message bhejna - CALLBACK based (reliable in compat SDK)
function sendMessage(uid, sender, text, imageUrl, replyTo) {
  return new Promise(function(resolve) {
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

    // push with callback - compat SDK me sabse reliable
    ref.push(newMsg, function(error) {
      if (error) {
        console.error("Send message error:", error);
        resolve(false);
      } else {
        console.log("Message sent successfully:", sender);
        // unread increment - fire and forget
        if (sender === "user") {
          incrementUnread(uid);
        }
        resolve(true);
      }
    });
  });
}

// messages as seen mark karna
function markMessagesAsSeen(uid, readerRole) {
  var senderToMark = readerRole === "admin" ? "user" : "admin";
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.once("value", function(snapshot) {
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
      ref.update(updates, function(error) {
        if (error) console.error("Mark seen error:", error);
      });
    }
  }, function(error) {
    console.error("Mark seen read error:", error);
  });
}

// specific message delete karna
function deleteMessage(uid, msgKey) {
  firebase.database().ref("helpCenter/chats/" + uid + "/" + msgKey).remove(function(error) {
    if (error) console.error("Delete message error:", error);
  });
}

// FCM token save karna
function saveFcmToken(uid, token) {
  firebase.database().ref("helpCenter/users/" + uid + "/fcmToken").set(token, function(error) {
    if (error) console.error("Save FCM token error:", error);
    else console.log("FCM token saved");
  });
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
  firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(count, function(error) {
    if (error) console.error("Update unread error:", error);
  });
}

// unread count increment karna
function incrementUnread(uid) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  ref.once("value", function(snapshot) {
    var current = snapshot.val() || 0;
    ref.set(current + 1, function(error) {
      if (error) console.error("Increment unread error:", error);
    });
  }, function(error) {
    console.error("Increment unread read error:", error);
  });
}

// unread count zero karna
function resetUnread(uid) {
  firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(0, function(error) {
    if (error) console.error("Reset unread error:", error);
  });
}

// user register karna
function registerUser(uid, username) {
  return new Promise(function(resolve) {
    firebase.database().ref("helpCenter/users/" + uid).set({
      userId: uid,
      username: username,
      unreadMsg: 0,
      fcmToken: ""
    }, function(error) {
      if (error) {
        console.error("Register user error:", error);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
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
}// Firebase Realtime Database helper functions

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

// message bhejna - CALLBACK based (reliable in compat SDK)
function sendMessage(uid, sender, text, imageUrl, replyTo) {
  return new Promise(function(resolve) {
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

    // push with callback - compat SDK me sabse reliable
    ref.push(newMsg, function(error) {
      if (error) {
        console.error("Send message error:", error);
        resolve(false);
      } else {
        console.log("Message sent successfully:", sender);
        // unread increment - fire and forget
        if (sender === "user") {
          incrementUnread(uid);
        }
        resolve(true);
      }
    });
  });
}

// messages as seen mark karna
function markMessagesAsSeen(uid, readerRole) {
  var senderToMark = readerRole === "admin" ? "user" : "admin";
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.once("value", function(snapshot) {
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
      ref.update(updates, function(error) {
        if (error) console.error("Mark seen error:", error);
      });
    }
  }, function(error) {
    console.error("Mark seen read error:", error);
  });
}

// specific message delete karna
function deleteMessage(uid, msgKey) {
  firebase.database().ref("helpCenter/chats/" + uid + "/" + msgKey).remove(function(error) {
    if (error) console.error("Delete message error:", error);
  });
}

// FCM token save karna
function saveFcmToken(uid, token) {
  firebase.database().ref("helpCenter/users/" + uid + "/fcmToken").set(token, function(error) {
    if (error) console.error("Save FCM token error:", error);
    else console.log("FCM token saved");
  });
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
  firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(count, function(error) {
    if (error) console.error("Update unread error:", error);
  });
}

// unread count increment karna
function incrementUnread(uid) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  ref.once("value", function(snapshot) {
    var current = snapshot.val() || 0;
    ref.set(current + 1, function(error) {
      if (error) console.error("Increment unread error:", error);
    });
  }, function(error) {
    console.error("Increment unread read error:", error);
  });
}

// unread count zero karna
function resetUnread(uid) {
  firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(0, function(error) {
    if (error) console.error("Reset unread error:", error);
  });
}

// user register karna
function registerUser(uid, username) {
  return new Promise(function(resolve) {
    firebase.database().ref("helpCenter/users/" + uid).set({
      userId: uid,
      username: username,
      unreadMsg: 0,
      fcmToken: ""
    }, function(error) {
      if (error) {
        console.error("Register user error:", error);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
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