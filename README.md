<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ace42580-93d4-4140-8d83-7eb10ad4449d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Firebase Setup (required for cross-device pool sharing)

Bracket Pools use Firebase Firestore to sync between devices.  Two one-time
steps are required before pools can be joined from a different device:

### 1 — Enable Anonymous Authentication

1. Open the [Firebase Console](https://console.firebase.google.com/) and select the **grand-slam-bracket** project.
2. Go to **Authentication → Sign-in method**.
3. Enable **Anonymous** sign-in and save.

This lets every app visitor receive a temporary Firebase auth token automatically, satisfying the Firestore security rules without requiring anyone to create an account.

### 2 — Deploy Firestore Security Rules

The `firestore.rules` file in this repo grants any signed-in user (including anonymous) read/write access to the `pools` collection.  Deploy it once with the Firebase CLI:

```sh
npm install -g firebase-tools   # install CLI once
firebase login                  # authenticate with your Google account
firebase deploy --only firestore:rules
```

After these two steps, pools created in the app will be stored in Firestore and joinable by code from any device.

