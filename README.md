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

## Project Structure

```
edmfire-web/
│
├── README.md
├── index.html (4.7 KB)
├── package.json (132 B)
├── vercel.json (276 B)
│
├── admin/
│   ├── index.html (5.9 KB) - Admin dashboard HTML
│   ├── admin.js (15.5 KB) - Admin functionality
│   └── admin.css (10.3 KB) - Admin styling
│
├── api/
│   ├── custom-token.js (1.5 KB) - Custom token generation
│   ├── firebase-config.js (1.0 KB) - Firebase configuration
│   └── send-notification.js (1.8 KB) - Notification service
│
├── firebase/
│   ├── auth.js (1.6 KB) - Authentication logic
│   ├── database.js (5.1 KB) - Database operations
│   └── storage.js (1.8 KB) - File storage operations
│
└── user/
    ├── index.html (5.0 KB) - User dashboard/home page
    ├── user.js (14.3 KB) - User interactions
    └── user.css (7.6 KB) - User styling
```

### Directory Details

**📂 /admin/** - Admin Panel
- Admin dashboard for realtime support
- Manages user chats and support tickets
- CSS styling for admin interface

**📂 /api/** - API Endpoints & Configuration
- Firebase configuration setup
- Custom token generation for authentication
- Notification service integration

**📂 /firebase/** - Firebase Services
- Authentication flow implementation
- Database operations and queries
- Storage/file upload handling

**📂 /user/** - User Interface
- User chat interface
- User interactions and messaging
- Responsive styling for user panel

## Auth Flow

```
┌─────────────────────────────────────────────────────┐
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
```

## Language Composition

- JavaScript: 56%
- CSS: 23.5%
- HTML: 20.5%

## Deployment

Deployed on Vercel: https://edmfire-web.vercel.app
