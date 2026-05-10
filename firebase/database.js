// Firebase Realtime Database helper functions

// users list load karna
function loadUsers(callback) {
  var ref = firebase.database().ref("helpCenter/users");
  ref.on("value", function(snapshot) {
    var data = snapshot.val();
    callback(data);
  });
}

// users list sirf ek baar load karna
function loadUsersOnce() {
  return new Promise(function(resolve, reject) {
    var ref = firebase.database().ref("helpCenter/users");
    ref.once("value", function(snapshot) {
      resolve(snapshot.val());
    }, reject);
  });
}

// messages load karna specific user ke
function loadMessages(uid, callback) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.on("value", function(snapshot) {
    var data = snapshot.val();
    callback(data);
  });
}

// messages sirf ek baar load karna
function loadMessagesOnce(uid) {
  return new Promise(function(resolve, reject) {
    var ref = firebase.database().ref("helpCenter/chats/" + uid);
    ref.once("value", function(snapshot) {
      resolve(snapshot.val());
    }, reject);
  });
}

// message bhejna
function sendMessage(uid, sender, text, imageUrl) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  var newMsg = {
    sender: sender,
    text: text || "",
    imageUrl: imageUrl || "",
    timestamp: Date.now()
  };
  return ref.push(newMsg).then(function() {
    // user ka unread count update karna (admin bhej raha hai to user ka unread badhana)
    if (sender === "admin") {
      return incrementUnread(uid);
    }
    return true;
  }).catch(function(error) {
    console.error("Send message error:", error);
    return false;
  });
}

// unread count update karna
function updateUnread(uid, count) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  return ref.set(count).then(function() {
    return true;
  }).catch(function(error) {
    console.error("Update unread error:", error);
    return false;
  });
}

// unread count increment karna
function incrementUnread(uid) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  return ref.once("value").then(function(snapshot) {
    var current = snapshot.val() || 0;
    return ref.set(current + 1);
  }).catch(function(error) {
    console.error("Increment unread error:", error);
    return false;
  });
}

// unread count zero karna
function resetUnread(uid) {
  var ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
  return ref.set(0).then(function() {
    return true;
  }).catch(function(error) {
    console.error("Reset unread error:", error);
    return false;
  });
}

// user register ya update karna users node me
function registerUser(uid, username) {
  var ref = firebase.database().ref("helpCenter/users/" + uid);
  return ref.set({
    userId: uid,
    username: username,
    unreadMsg: 0
  }).then(function() {
    return true;
  }).catch(function(error) {
    console.error("Register user error:", error);
    return false;
  });
}

// realtime messages listener
function listenRealtimeMessages(uid, callback) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.on("child_added", function(snapshot) {
    callback(snapshot.key, snapshot.val());
  });
  return ref;
}

// listener remove karna
function offMessagesListener(uid) {
  var ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.off();
}