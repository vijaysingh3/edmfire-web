// Firebase Realtime Database helper functions

// users list load karna
function loadUsers(callback) {
  const ref = firebase.database().ref("helpCenter/users");
  ref.on("value", (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
}

// users list sirf ek baar load karna
function loadUsersOnce() {
  return new Promise((resolve, reject) => {
    const ref = firebase.database().ref("helpCenter/users");
    ref.once("value", (snapshot) => {
      resolve(snapshot.val());
    }, reject);
  });
}

// messages load karna specific user ke
function loadMessages(uid, callback) {
  const ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.on("value", (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
}

// messages sirf ek baar load karna
function loadMessagesOnce(uid) {
  return new Promise((resolve, reject) => {
    const ref = firebase.database().ref("helpCenter/chats/" + uid);
    ref.once("value", (snapshot) => {
      resolve(snapshot.val());
    }, reject);
  });
}

// message bhejna
async function sendMessage(uid, sender, text, imageUrl) {
  try {
    const ref = firebase.database().ref("helpCenter/chats/" + uid);
    const newMsg = {
      sender: sender,
      text: text || "",
      imageUrl: imageUrl || "",
      timestamp: Date.now()
    };
    await ref.push(newMsg);

    // user ka unread count update karna (admin bhej raha hai to user ka unread badhana)
    if (sender === "admin") {
      await incrementUnread(uid);
    }

    return true;
  } catch (error) {
    console.error("Send message error:", error);
    return false;
  }
}

// unread count update karna
async function updateUnread(uid, count) {
  try {
    const ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
    await ref.set(count);
    return true;
  } catch (error) {
    console.error("Update unread error:", error);
    return false;
  }
}

// unread count increment karna
async function incrementUnread(uid) {
  try {
    const ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
    const snapshot = await ref.once("value");
    const current = snapshot.val() || 0;
    await ref.set(current + 1);
    return true;
  } catch (error) {
    console.error("Increment unread error:", error);
    return false;
  }
}

// unread count zero karna (user ya admin chat open kare to)
async function resetUnread(uid) {
  try {
    const ref = firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg");
    await ref.set(0);
    return true;
  } catch (error) {
    console.error("Reset unread error:", error);
    return false;
  }
}

// user register ya update karna users node me
async function registerUser(uid, username) {
  try {
    const ref = firebase.database().ref("helpCenter/users/" + uid);
    await ref.set({
      userId: uid,
      username: username,
      unreadMsg: 0
    });
    return true;
  } catch (error) {
    console.error("Register user error:", error);
    return false;
  }
}

// realtime messages listener
function listenRealtimeMessages(uid, callback) {
  const ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.on("child_added", (snapshot) => {
    callback(snapshot.key, snapshot.val());
  });
  return ref;
}

// listener remove karna
function offMessagesListener(uid) {
  const ref = firebase.database().ref("helpCenter/chats/" + uid);
  ref.off();
}
