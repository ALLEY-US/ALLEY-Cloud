# ALLEY Cloud — NANO AI Website + Email OTP Authentication

This repository package contains the single-file ALLEY Cloud website and the Firebase backend needed for real email-code registration.

## Website features

- Single-file `index.html` with embedded styling, JavaScript, favicon, and logos.
- NANO AI product branding and demo chat interface.
- Free, Plus, Pro, Ultra, and customizable Business plan pages and pricing.
- Detailed plan dialogs, Business plan configurator, SSH/Linux server feature descriptions, and simulated terminal.
- Email/password login through Firebase Authentication.
- Three-step registration: enter email → receive and enter a six-digit email code → choose a password.
- Firebase Authentication persistent sign-in (the browser stays signed in until the user signs out, subject to Firebase/browser behavior).
- Cloud Functions send and verify email codes; codes expire in 10 minutes and verification attempts are limited.
- Google and Apple sign-in buttons have been removed.

## Important: a website HTML file alone cannot safely send email codes

The page is ready to call Firebase callable Cloud Functions, but real signup will not work until you add your Firebase Web App config and deploy the included backend. Do not generate the code in browser JavaScript: visitors could inspect it and bypass verification.

## 1. Configure the Firebase web app

1. Open [Firebase Console](https://console.firebase.google.com/) and select your project.
2. Go to **Project settings → General → Your apps → Web app** and copy the Web App configuration.
3. In the `index.html` Firebase module near the bottom, replace these placeholders:
   - `PASTE_FIREBASE_API_KEY`
   - `PASTE_FIREBASE_PROJECT_ID` (replace in both `authDomain` and `projectId`)
   - `PASTE_FIREBASE_APP_ID`
4. The config is public client configuration, not an Admin key. Never place service-account keys, SMTP passwords, or private keys in `index.html`.

## 2. Enable Firebase Authentication

1. In Firebase Console, open **Authentication → Sign-in method** (or **Sign-in providers**).
2. Enable **Email/Password** and save.
3. Under **Authentication → Settings → Authorized domains**, add your GitHub Pages host name, for example `yourname.github.io` (host name only; no protocol or repository path).

## 3. Create Firestore

1. Open **Firestore Database** in Firebase Console.
2. Create a database in a location close to your Cloud Functions region. This package uses `us-central1`.
3. The included `firestore.rules` denies browser access to OTP and rate-limit documents; Cloud Functions accesses them through the Admin SDK. Review rules before adding other client-facing data collections.

## 4. Configure an email sender

The backend sends code messages over SMTP. Choose an email service that allows transactional SMTP sending. Get its SMTP host, port, username, password/API credential, and a sender address you control. Do not commit these secrets to GitHub.

From a terminal where Node.js 22 and npm are installed:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

Select the same Firebase project where you enabled Authentication and created Firestore. Then from the root folder of this package, set the SMTP values as Firebase-managed secrets. Each command prompts for a secret value:

```bash
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set MAIL_FROM
firebase functions:secrets:set OTP_HMAC_SECRET
```

For `OTP_HMAC_SECRET`, use a long random value (at least 32 random bytes). Generate one with `openssl rand -hex 32` if available, then paste it into the secret prompt. `MAIL_FROM` should be a sender address authorized by your email provider. Do not put real values in README, source code, or GitHub issues.

Install dependencies and deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

Deployment of Firebase Cloud Functions currently requires the Firebase/Google Cloud Blaze billing plan. Review Cloud Functions pricing and set budget alerts before deploying. Email providers may also have sending costs or limits.

## 5. Publish the website on GitHub Pages

1. Upload the updated `index.html` to the root of your `ALLEY Cloud` GitHub repository, replacing the existing file.
2. In GitHub, select **Settings → Pages** and publish from the `main` branch and root folder if Pages is not already enabled.
3. Open the published HTTPS site, then test registration with an email inbox you can access.
4. Test login with the same email/password, refresh the page, and confirm the Firebase session stays signed in. Use the website's Log Out action to clear it.

## How the six-digit flow works

- `sendSignupCode`: makes a random six-digit code and emails it through the configured SMTP provider. The code's HMAC is stored in Firestore with a 10-minute expiry, rate limits, and attempt count. The plaintext code is not stored in Firestore.
- `verifySignupCode`: checks the code and issues a short-lived random proof token.
- `createAccountWithPassword`: consumes the proof once, creates the Firebase Auth user as email-verified, stores basic profile metadata, and returns a Firebase custom token.
- The browser signs in with the custom token and uses Firebase's local persistence. The password is not stored in localStorage or sessionStorage.
- Login uses `signInWithEmailAndPassword` and Firebase Authentication. Local persistence is selected so a user usually remains signed in after closing and reopening the browser until they sign out.

## Security / production limitations

- The Functions code has email and IP rate limits, a 10-minute code timeout, a five-attempt verification limit, HMAC-protected codes, one-use registration proof, and secrets stored with Firebase's secret manager. Review and adapt the quotas before public launch; production should add App Check, monitoring, alerting, and abuse detection.
- Metadata kept in browser storage is only for display/navigation. It is not authorization. Protect every private API, AI request, payment, SSH operation, proxy/VPN service, and domain/server action by verifying Firebase ID tokens on a trusted backend.
- The site still contains demo UI for NANO AI, website hosting, Linux server / SSH, proxy, VPN, and subscription features. Those services are not activated by creating an account.
- The SMTP credentials and `OTP_HMAC_SECRET` must never be shared or committed.
- If SMTP delivery fails, check Firebase function logs and your email provider's sender verification, rate limits, and spam folder.
