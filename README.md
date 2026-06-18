# W Studio Learn

Online course platform for `learn.wstudio3d.com`.

## Architecture

- Static HTML/CSS/JS frontend, deployable on Vercel.
- Firebase Authentication in the browser for email/password and Google sign-in.
- Vercel Functions under `/api` verify Firebase ID tokens with Firebase Admin.
- PayPal Checkout creates and captures one order per course.
- Firestore stores access at `students/{uid}/courses/{courseId}`.
- Course catalog and translated copy live in `data/courses.json`.

## Vercel Environment Variables

Public Firebase client config:

```text
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MEASUREMENT_ID=
```

Firebase Admin, choose either JSON or split variables:

```text
FIREBASE_SERVICE_ACCOUNT=
```

or

```text
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

PayPal:

```text
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
```

Use `PAYPAL_ENV=live` only after testing sandbox purchases.

## Local Checks

```bash
npm install
npm run check
```

For full local API testing, install the Vercel CLI and run:

```bash
npm run dev
```

## Firebase Setup

Enable Email/Password and Google providers in Firebase Authentication. Add these authorized domains:

- `learn.wstudio3d.com`
- the Vercel preview domain
- `localhost` for local testing

## Course Editing

Add courses, prices, lesson titles, and translations in `data/courses.json`. Keep prices as strings such as `"47.00"` so PayPal receives exact decimal values.
