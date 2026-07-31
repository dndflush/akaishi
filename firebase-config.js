/* ================================
   Akaishi Contracting — firebase-config.js
   Fill in the placeholders below with your own values, then delete
   this comment block. See README.md → "Setup" for exact steps.
   ================================ */

// From the Firebase console: Project settings → General → Your apps → Web app → SDK setup and configuration
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// From Google Cloud Console: APIs & Services → Credentials → OAuth 2.0 Client IDs → (Web application)
// Authorized JavaScript origins must include your GitHub Pages URL, e.g.
// https://yourname.github.io  (and http://localhost:xxxx for local testing)
export const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// Only this Google account sees the /dashboard.html admin view.
// NOTE: this is a UI convenience, not real security — see README.md.
export const ADMIN_EMAIL = "dndflush@gmail.com";
