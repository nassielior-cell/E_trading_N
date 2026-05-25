# Firebase Authentication Setup

This app now has one Firebase browser client: `src/lib/firebase.ts`.

## Required `.env.local`

Create or update `C:\E_trading_N\.env.local` with only the Web app config values copied from Firebase Console > Project settings > Your apps > Web app:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

`NEXT_PUBLIC_FIREBASE_API_KEY` must be the Web app `apiKey`. It normally starts with `AIza`. It is not the project id, project name, auth domain, or app nickname.

Restart Next.js after editing `.env.local`.

## Authorized Domains

Open Firebase Console > Authentication > Settings > Authorized domains.

For local development, add:

- `localhost`
- `127.0.0.1`
- `192.168.50.112` if you open the app from a phone or tablet on the local network

Do not include `http://`, `https://`, or a port number in Firebase authorized domains.

On a real iPhone or Android device, do not open `localhost`; that points back to the phone. Use `http://192.168.50.112:3000` while the dev server is running on the computer.

## Enable Google Login

1. Open Firebase Console > Authentication > Sign-in method.
2. Select Google.
3. Enable it.
4. Choose a project support email.
5. Save.

## Enable Facebook Login

1. Create or open an app in Meta for Developers.
2. Add Facebook Login for Web.
3. Copy the Facebook App ID and App secret.
4. In Firebase Console > Authentication > Sign-in method, select Facebook.
5. Enable it and paste the App ID and App secret.
6. Copy the OAuth redirect URI shown by Firebase.
7. Paste that URI into Meta for Developers > Facebook Login > Settings > Valid OAuth Redirect URIs.
8. Save in both Firebase and Meta.

## Enable Apple Login

1. In Apple Developer, create/configure an identifier for Sign in with Apple.
2. Create a Services ID for the web login flow.
3. Add the Firebase OAuth redirect URI shown in Firebase to the Services ID return URLs.
4. Create or choose a Sign in with Apple key and note the Team ID, Key ID, Services ID, and private key.
5. In Firebase Console > Authentication > Sign-in method, select Apple.
6. Enable it and enter the Apple Team ID, Key ID, Services ID, and private key.
7. Save.

## Login Test Flow

1. Stop all old Next.js processes.
2. Delete `.next`.
3. Start one clean dev server from `C:\E_trading_N`.
4. Open the app on desktop through `http://localhost:3000`.
5. Test Continue with Google and confirm the desktop popup flow works.
6. Sign out.
7. Open the app on iPhone Safari, iPhone Chrome, or Android Chrome through `http://192.168.50.112:3000`.
8. Test Continue with Google and confirm the mobile redirect flow returns directly to the journal.
9. Sign out.
10. Sign in again, refresh the browser, and confirm the user stays logged in.
11. Reopen an existing journal and confirm the remembered journal opens after refresh.

If a login fails, the login screen shows Hebrew and English messages for missing config, invalid API key, disabled provider, blocked/closed popup, cancelled redirect, unauthorized domain, invalid credentials, network errors, internal errors, and Firebase initialization failures.
