# Production Deployment

This project is a static-exportable Next.js app that uses Firebase Auth, Firestore, and Firebase Storage from the browser. Production deployment must use the same Firebase project values as local development so existing users keep the same UID-backed journals under `users/{uid}/journals`.

## Recommended Platform

Vercel is the easiest general Next.js deployment because it detects Next.js automatically and manages builds, domains, HTTPS, and environment variables from the dashboard.

Firebase Hosting is also compatible for this app because `next.config.ts` uses `output: 'export'` and the app has no API routes, server actions, middleware, SSR pages, or optimized `next/image` requirements. Firebase Hosting keeps hosting and Firebase Auth/Firestore in one console, which is convenient after the initial setup.

## Required Production Environment Variables

Set these to the Web app config from Firebase Console > Project settings > Your apps > Web app:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_WORKSPACE_ID=personal-journal
NEXT_PUBLIC_DONATION_BTC=
NEXT_PUBLIC_DONATION_ETH=
NEXT_PUBLIC_DONATION_SOL=
NEXT_PUBLIC_DONATION_USDT_TRC20=
```

Use the same `NEXT_PUBLIC_FIREBASE_PROJECT_ID` as local if you want existing journals to appear after login. Do not create a new Firebase project for production unless you intentionally want empty production data.

## Firebase Hosting Deploy

Install/login once:

```powershell
npm.cmd install
npm.cmd install -g firebase-tools
firebase login
```

Select the existing Firebase project that already contains the Auth users and Firestore journals:

```powershell
firebase use --add
```

Build and deploy:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
firebase deploy --only hosting
```

Firebase will deploy the static site from `out/`. Use this official production URL:

```text
https://e-trading-n.firebaseapp.com
```

Do not publish the `web.app` URL as the main link while mobile Google auth is standardized on `firebaseapp.com`.

## Vercel Deploy

Install/login once:

```powershell
npm.cmd install
npm.cmd install -g vercel
vercel login
```

Create/link the Vercel project from `C:\E_trading_N`:

```powershell
vercel
```

In Vercel Dashboard > Project > Settings > Environment Variables, add every `NEXT_PUBLIC_*` variable above for Production. Then deploy:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
vercel --prod
```

The production URL will be:

```text
https://<vercel-project>.vercel.app
```

## Firebase Auth Settings

Open Firebase Console > Authentication > Settings > Authorized domains.

Add the production host only, without protocol and without a path:

```text
e-trading-n.firebaseapp.com
```

For Vercel, add:

```text
<vercel-project>.vercel.app
```

If you later attach a custom domain, also add:

```text
your-domain.com
```

Then open Firebase Console > Authentication > Sign-in method > Google and confirm Google is enabled and a support email is selected.

## Firestore Data Safety

Deployment does not delete Firestore data. Existing journals remain in:

```text
users/{uid}/journals/{journalId}
users/{uid}/journals/{journalId}/entries/{entryId}
```

Data will remain visible after production login when all of these stay the same:

- Same Firebase project.
- Same Google account or email/password user.
- Same Firebase Auth provider setup.
- Same Firestore rules allowing the signed-in user to read/write their own `users/{uid}` documents.

## Desktop And Mobile Test

Use the exact same HTTPS URL on both devices, for example:

```text
https://e-trading-n.firebaseapp.com
```

Test sequence:

1. Desktop: open the production URL, sign in with Google, confirm the journal loads.
2. Desktop: add a small test entry, refresh, confirm it remains.
3. Mobile: open the same production URL, sign in with the same Google account, confirm the same journal appears.
4. Mobile: refresh the page and close/reopen the browser tab, confirm the session and journal remain.
5. Desktop: refresh again and confirm the mobile-created or mobile-viewed data is still present.
