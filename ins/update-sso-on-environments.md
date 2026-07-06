## Complete: Environment-Aware Authentication

Three files were modified to make the login flow environment-aware based on `NEXT_PUBLIC_ENV`.

### Changes Summary

| File | What Changed | Effect on Local/QAS | Effect on Production |
|------|-------------|--------------------|---------------------|
| **`src/core/sso-client.js`** | `redirectToLogin()` now redirects to same-origin `/login` when not in prod | Stays on `dev-gutter.vercel.app/login` after clicking Login | Still redirects to `www.psbuniverse.com/login` (SSO) |
| **`src/modules/psbpages/login/pages/LoginView.jsx`** | `DEFAULT_REDIRECT` is `/dashboard` (relative) when not in prod | After login, redirects to same-origin `/dashboard` | After login, still redirects to `www.psbuniverse.com/dashboard` |
| **`src/core/auth/cookies.utils.js`** | `COOKIE_DOMAIN` is empty + `COOKIE_SECURE=false` when not in prod | Cookies stay origin-scoped (browser won't reject them on `.vercel.app`) | Cookies still scoped to `.psbuniverse.com` with `Secure` flag |
| **`src/core/sso-client.js`** | `clearPSBUserPayloadCookie()` only includes `Domain` attribute in prod | Clean cookie removal without domain scope | Still clears `.psbuniverse.com` cookie |

### How It Works

The key is `NEXT_PUBLIC_ENV` — already set in every deployment via `.env.local` (local) and Vercel environment variables (QAS/PROD). The code evaluates:

- **Production** (`NEXT_PUBLIC_ENV=prod`): Existing behavior — SSO redirect to core portal, cross-subdomain cookies, secure flags.
- **Everything else** (`dev` or `local`): Stays on the same origin — no cross-domain redirects, no wildcard domain cookies, no Secure requirement on local HTTP connections.

### Vercel Setup Reminder

For each QAS deployment, ensure Vercel env vars include:
```
NEXT_PUBLIC_ENV=dev
```
For production:
```
NEXT_PUBLIC_ENV=prod
```