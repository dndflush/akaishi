# Akaishi Contracting — GitHub Pages migration

This is your site, moved off Netlify onto plain static hosting (GitHub Pages).
Two things had to be replaced because GitHub Pages has no server or functions:

| Before (Netlify) | Now (GitHub Pages) |
|---|---|
| Netlify Identity (Google sign-in) | Google Identity Services (client-side sign-in) |
| `netlify/functions/verify-admin.js` (server-verified admin check) | plain JS check against `ADMIN_EMAIL` — UI-only, not enforced |
| `localStorage` for bookings/applications (per-browser, not really "saved") | Firebase Firestore (shared database, same data everywhere) |

**Read "What changed, security-wise" below before you launch this for real** — it's short and matters.

## Setup

You need two free accounts: a Firebase project (for the database) and a Google Cloud OAuth client (for sign-in). Both live under the same Google account and can even be the *same* Google Cloud project.

### 1. Create a Firebase project + Firestore database
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (Analytics optional, skip it).
2. In the left sidebar: **Build → Firestore Database → Create database**. Choose a region close to your players, start in **production mode**.
3. Go to **Firestore Database → Rules**, delete what's there, and paste in the contents of `firestore.rules` from this repo. Click **Publish**.
4. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the `</>` (web) icon → register an app (any nickname) → copy the `firebaseConfig` object it shows you.

### 2. Create a Google OAuth Client ID (for sign-in)
1. In the same project, go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) (make sure the project selector at the top matches your Firebase project).
2. **Configure consent screen** if prompted (External, fill in app name + your email, publish it).
3. **Create Credentials → OAuth client ID → Application type: Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `https://YOUR-GITHUB-USERNAME.github.io`
   - `http://localhost:5500` (or whatever port you use to preview locally — optional)
5. Copy the generated **Client ID** (ends in `.apps.googleusercontent.com`).

### 3. Fill in `firebase-config.js`
Open `firebase-config.js` in this repo and paste in:
- the `firebaseConfig` object from step 1.4
- the `GOOGLE_CLIENT_ID` from step 2.5
- `ADMIN_EMAIL` — the Google account that should see the Dashboard (already set to the one from your old site)

### 4. Push to GitHub and enable Pages
```bash
git init
git add .
git commit -m "Migrate to GitHub Pages"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```
Then in the repo on GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.

Your site will be live at `https://YOUR-USERNAME.github.io/YOUR-REPO/` within a minute or two. If you added that exact URL as an authorized origin in step 2.4, sign-in will work immediately.

> Using a custom domain instead? Add a `CNAME` file with your domain in it, and add that domain (not the `github.io` one) as the authorized origin in step 2.4 instead.

## What changed, security-wise

You chose the fast path, so it's worth being clear-eyed about what that means:

- **The Dashboard admin check is a UI toggle, not a lock.** `script.js` compares the signed-in email to `ADMIN_EMAIL` in the browser. Anyone can open devtools and see the dashboard markup regardless of who they're signed in as.
- **The database is open.** `firestore.rules` allows anyone to read or write the `bookings` and `applications` collections — because without a server, Firestore has no way to know who's really asking. In practice this means someone could, with a bit of effort, read all submissions or write fake/garbage entries directly against the database, bypassing your site entirely.
- **Sign-in itself is genuine** (it really is Google confirming the person's identity) — what's *not* verified server-side is what they're allowed to do afterward.

This mirrors the tradeoff in your original setup, minus the one part (`verify-admin.js`) that used to be real.

### Locking it down later
If this ever needs to be tamper-resistant, the smallest upgrade is: swap Google Identity Services for **Firebase Authentication** (Google provider) — same look and feel, same free tier, but Firestore rules can then check `request.auth.token.email` directly, so you can write rules like "only the admin can update `status`" or "users can only read their own bookings," enforced by Firebase's servers rather than trusted client code. No server hosting required on your end even for that — just a different rules file and a few lines in `script.js`. Ask me if you want that written up.

## Files
- `index.html`, `apply.html`, `request.html`, `my-bookings.html`, `my-applications.html`, `dashboard.html` — pages
- `style.css` — styles (unchanged)
- `script.js` — sign-in + Firestore data logic (rewritten)
- `firebase-config.js` — **fill this in**, your project's keys
- `firestore.rules` — paste into Firebase console
- `favicon.png` — unchanged
- `.nojekyll` — tells GitHub Pages to serve files as-is
