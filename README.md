# EDMFire - Help Center Web App

Realtime Help Center web application using Firebase.

## Features

- User Chat (standalone chat page)
- Admin Panel (realtime support dashboard)
- Firebase Authentication
- Firebase Realtime Database
- Firebase Storage (image upload)
- Mobile-first responsive design

## Setup

1. Add your Firebase config in `firebase/firebase-config.js`
2. Add admin UIDs in `firebase/auth.js` (ADMIN_UIDS array)
3. Deploy to Vercel

## URLs

- User Chat: `/user/`
- Admin Panel: `/admin/`

## Tech Stack

- HTML + CSS + Vanilla JavaScript
- Firebase SDK (Compat)
## auth flow
-┌─────────────────────────────────────────────────────┐
│                  ANDROID APP                        │
│                                                     │
│  1. HelpActivity open → WebView loads page          │
│     URL: https://edmfire-web.vercel.app/user/       │
│     (NO token in URL)                               │
│                                                     │
│  2. onPageFinished() triggers                       │
│  3. user.getIdToken() → ID Token milta hai          │
│  4. evaluateJavascript("receiveAuthToken('TOKEN')") │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  WEB PAGE (/user/)                   │
│                                                     │
│  5. receiveAuthToken(idToken) called by Android     │
│  6. POST /api/custom-token { idToken }              │
│  7. Firebase Admin verify → customToken return      │
│  8. signInWithCustomToken(customToken) ✅            │
│  9. Chat loads!                                     │
└─────────────────────────────────────────────────────┘
-
