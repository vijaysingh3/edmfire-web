# EDMFire Web

Realtime Help Center web application for the **EDMFire** Android app, built with Firebase and deployed on Vercel. Provides an in-app user chat interface and an admin support dashboard, both powered by Firebase Realtime Database, Auth, and Storage.

## Features

### User Chat (`/user/`)
- Realtime one-to-one chat between users and admin support
- Image upload with client-side WebP compression (800px max, 70% quality)
- Reply to specific messages with quoted context
- Long-press context menu (Reply / Copy / Delete)
- Message seen ticks (sent ✓ / read ✓✓)
- Unread message counter for admin
- Mobile-first design optimized for Android WebView
- Keyboard-aware layout with navigation bar safe area handling

### Admin Panel (`/admin/`)
- Realtime support dashboard showing all user conversations
- User list with last message preview and unread badge
- Click-to-open chat with any user
- Same messaging features as user chat (text, image, reply, delete)
- Push notification delivery via FCM when admin replies

### Shared Infrastructure
- Firebase Authentication via Custom Token flow (Android WebView → Web)
- Firebase Realtime Database for messages and user data
- Firebase Storage for image uploads
- Vercel Serverless Functions for secure API endpoints
- FCM push notification integration

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (no framework) |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Firebase Realtime Database |
| Auth | Firebase Auth (Custom Token + Email/Password) |
| Storage | Firebase Storage |
| Notifications | Firebase Cloud Messaging (FCM) |
| Fonts | Google Fonts (Poppins) |
| Icons | Inline SVG (no external icon library) |
| Deployment | Vercel (auto-deploy from GitHub `main` branch) |

## Project Structure

```
edmfire-web/
|
|-- README.md                  This file
|-- index.html                 Landing/redirect page
|-- package.json               Node dependencies (firebase-admin)
|-- vercel.json                Vercel routing & rewrites config
|
|-- admin/                     Admin Panel
|   |-- index.html             Admin dashboard HTML
|   |-- admin.js               Admin chat logic & UI interactions
|   |-- admin.css              Admin styling
|
|-- api/                       Vercel Serverless Functions
|   |-- custom-token.js        ID Token -> Custom Token exchange
|   |-- firebase-config.js     Firebase config served from env vars
|   |-- send-notification.js   FCM push notification sender
|
|-- firebase/                  Shared Firebase Utilities
|   |-- auth.js                Auth helpers (signIn, customToken, admin check)
|   |-- database.js            Database CRUD (messages, users, unread, FCM)
|   |-- storage.js             Image upload with WebP compression
|
|-- user/                      User Chat Page
    |-- index.html             User chat HTML
    |-- user.js                User chat logic & UI interactions
    |-- user.css               User chat styling (WebView-optimized)
```

### File Details

**`api/custom-token.js`** — Receives an Firebase ID Token from the Android app, verifies it using Firebase Admin SDK, and returns a Custom Token for client-side sign-in. This is the core of the Android → Web auth bridge.

**`api/firebase-config.js`** — Serves Firebase client configuration as a JavaScript file. All config values are read from Vercel environment variables, keeping secrets out of the codebase.

**`api/send-notification.js`** — Looks up a user's FCM token from the database and sends a push notification. Called by the admin panel when a support reply is sent.

**`firebase/auth.js`** — Shared authentication utilities including `signInWithCustomToken()` for Android WebView users, `signInWithEmail()` for admin panel login, `checkAdminAccess()` for role verification, and `onAuthChange()` listener.

**`firebase/database.js`** — Complete database abstraction layer with functions for loading/sending/deleting messages, user registration, unread count management, FCM token storage, and realtime listeners.

**`firebase/storage.js`** — Image upload with automatic client-side compression. Resizes images to 800px max dimension, converts to WebP at 70% quality before uploading to Firebase Storage.

**`user/user.css`** — Mobile-first CSS optimized for Android WebView. Uses `height: 100%` instead of `100vh` (which includes navigation bar area in WebView). Bottom bar includes `env(safe-area-inset-bottom)` padding as a safety net. All interactive elements use `flex-shrink: 0` to prevent layout overflow.

**`user/user.js`** — Chat logic with null-safe DOM access, emergency `setAppHeight()` fallback for viewport issues, and `receiveAuthToken()` / `receiveFcmToken()` hooks for Android JavaScript bridge injection.

## Auth Flow

The Android app uses WebView to load the user chat page. Authentication is handled through a secure token exchange process — no credentials are ever passed in URLs or stored in WebView.

```
Android App (HelpActivity)
|
|-- 1. WebView loads: https://edmfire-web.vercel.app/user/
|-- 2. onPageFinished() triggers
|-- 3. Firebase Auth currentUser.getIdToken() -> ID Token
|-- 4. evaluateJavascript("receiveAuthToken('ID_TOKEN')")
|
v
Web Page (/user/)
|
|-- 5. receiveAuthToken(idToken) receives token from Android
|-- 6. POST /api/custom-token { idToken }
|-- 7. Firebase Admin verifies ID Token -> creates Custom Token
|-- 8. signInWithCustomToken(customToken) -> authenticated!
|-- 9. Chat loads with user's UID
```

**Admin Panel** uses standard email/password login via `signInWithEmail()`, with access restricted to UIDs in the `ADMIN_UIDS` array in `firebase/auth.js`.

## Database Schema

```
helpCenter/
|-- users/
|   |-- {uid}/
|       |-- userId: string
|       |-- username: string
|       |-- unreadMsg: number
|       |-- fcmToken: string
|
|-- chats/
    |-- {uid}/
        |-- {pushKey}/
            |-- sender: "user" | "admin"
            |-- text: string
            |-- imageUrl: string
            |-- seen: boolean
            |-- timestamp: number
            |-- replyTo: string (optional, references another pushKey)
```

## Android WebView Integration

The user chat page is designed specifically for Android WebView. The `HelpActivity` in the Android app handles:

1. **WebView Setup** — JavaScript enabled, DOM storage enabled, `textZoom = 100` for consistent text sizing
2. **Navigation Bar Fix** — `webView.setPadding(0, 0, 0, navBarHeight)` prevents content from hiding behind the Android navigation bar. The nav bar height is calculated from `navigation_bar_height` system dimension resource.
3. **System Window Padding** — `FrameLayout` with `fitsSystemWindows = true` adds automatic padding for status bar
4. **Token Injection** — `onPageFinished()` injects Firebase Auth ID Token and FCM Token via `evaluateJavascript()`
5. **Image Picker** — `WebChromeClient.onShowFileChooser()` bridges the Android file picker to the HTML `<input type="file">` element

### Critical WebView Note

The CSS uses `height: 100%` instead of `100vh`. In Android WebView, `100vh` includes the navigation bar area, which causes the bottom of the page (including the send button) to be hidden behind the nav bar. With `height: 100%` combined with the `setPadding()` fix in Kotlin, the page content fits exactly within the visible area.

## Setup

### Prerequisites
- A Firebase project with Realtime Database, Authentication, and Storage enabled
- Vercel account for deployment
- Android project with Firebase SDK integrated

### Environment Variables

Set these in your Vercel project settings (Settings > Environment Variables):

**Firebase Client Config (used by `api/firebase-config.js`):**
```
FB_API_KEY=
FB_AUTH_DOMAIN=
FB_DATABASE_URL=
FB_PROJECT_ID=
FB_STORAGE_BUCKET=
FB_MESSAGING_SENDER_ID=
FB_APP_ID=
FB_MEASUREMENT_ID=
```

**Firebase Admin Config (used by `api/custom-token.js` and `api/send-notification.js`):**
```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_DATABASE_URL=
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/vijaysingh3/edmfire-web.git
cd edmfire-web

# Install dependencies
npm install

# Install Vercel CLI
npm i -g vercel

# Link to your Vercel project
vercel link

# Pull environment variables
vercel env pull .env.local

# Run locally
vercel dev
```

### Deploy

Push to the `main` branch — Vercel auto-deploys. Or deploy manually:

```bash
vercel --prod
```

### Admin Access

Edit the `ADMIN_UIDS` array in `firebase/auth.js` to add your Firebase Auth UID:

```javascript
var ADMIN_UIDS = ["YOUR_ADMIN_UID_HERE"];
```

## API Endpoints

### `POST /api/custom-token`
Exchange a Firebase ID Token for a Custom Token (used by Android WebView).

**Request:**
```json
{ "idToken": "firebase_id_token_string" }
```

**Response:**
```json
{ "customToken": "custom_token_string", "uid": "user_uid" }
```

### `GET /api/firebase-config`
Returns Firebase client configuration as JavaScript. Config values are sourced from environment variables.

**Response:** `Content-Type: application/javascript`

### `POST /api/send-notification`
Send an FCM push notification to a user.

**Request:**
```json
{ "uid": "user_uid", "title": "New Message", "body": "You have a new support message" }
```

**Response:**
```json
{ "sent": true }
```

## Language Composition

| Language | Percentage |
|---|---|
| JavaScript | 56% |
| CSS | 23.5% |
| HTML | 20.5% |

## URLs

| Page | URL |
|---|---|
| Landing | `/` |
| User Chat | `/user/` |
| Admin Panel | `/admin/` |

**Live:** https://edmfire-web.vercel.app
