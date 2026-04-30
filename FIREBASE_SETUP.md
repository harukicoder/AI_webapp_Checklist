# Google Sign-In and Cloud Sync Setup

This app uses Firebase Authentication for Google sign-in and Cloud Firestore for real-time checklist sync.

## 1. Create Firebase Project

1. Go to <https://console.firebase.google.com/>.
2. Create a project.
3. Add a Web app.
4. Copy the Firebase config object.

## 2. Enable Google Sign-In

1. Open Firebase Console.
2. Go to Authentication.
3. Open Sign-in method.
4. Enable Google.
5. Add this authorized domain:

```text
harukicoder.github.io
```

## 3. Create Firestore Database

1. Open Firestore Database.
2. Create a database.
3. Start in production mode.
4. Use the nearest region.

## 4. Add Security Rules

Paste these rules in Firestore Rules:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /workspaces/{workspaceId} {
      function signedIn() {
        return request.auth != null;
      }

      function isMember() {
        return signedIn() && resource.data.members[request.auth.uid] == true;
      }

      function isCreator() {
        return signedIn()
          && request.resource.data.ownerUid == request.auth.uid
          && request.resource.data.members[request.auth.uid] == true;
      }

      function isJoiningSelf() {
        return signedIn()
          && resource.data.joinOpen == true
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            "members",
            "memberProfiles",
            "updatedAt"
          ])
          && request.resource.data.members[request.auth.uid] == true;
      }

      allow create: if isCreator();
      allow read: if isMember();
      allow update: if isMember() || isJoiningSelf();
      allow delete: if signedIn() && resource.data.ownerUid == request.auth.uid;
    }
  }
}
```

Publish the rules.

## 5. Add Firebase Config

Open `firebase-config.js`, set `enabled` to `true`, and replace the placeholder values:

```js
window.CHECKLIST_FIREBASE_CONFIG = {
  enabled: true,
  firebase: {
    apiKey: "...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

Commit and push the updated `firebase-config.js`.

## 6. Use Sync

1. Open the app.
2. Tap the cloud button.
3. Sign in with Google.
4. Use the same Google account on phone and laptop for personal sync.
5. To share with friends, tap Share workspace and send them the invite link.

Your Firebase web config is not a password, but only your Firestore rules keep the data private. Do not skip the rules.
