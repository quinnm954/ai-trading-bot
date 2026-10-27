# Stop bot sign-ups with an "I'm not a robot" check

## What you'll see
- The sign-up and sign-in forms get a small Cloudflare Turnstile check. Most real people only see a brief "Verifying..." tick and never solve a puzzle.
- Bots that skip the check are refused by the server, even if they bypass the page and send requests directly.
- The block on "keyhunt" and "probe" emails stays in place as a second layer.

## What I need from you
A free Cloudflare account lets you create a Turnstile "site" for titanaitrader.app. It gives you two keys:
- **Site key** (public): this goes into the app.
- **Secret key**: you'll paste it into a secure box I open for you, and it's never shown in chat.

I'll list the exact clicks when we get there, so this takes about 2 minutes.

## Steps
1. Add the Turnstile widget to the sign-up, sign-in and password-reset forms. The submit button stays disabled until the check passes.
2. Pass the check's token with each sign-up, sign-in and reset request.
3. Turn on server-side robot checking for accounts using your secret key, so requests without a valid token are rejected.
4. Show a friendly message if the check fails or expires, with a retry.
5. Test a real sign-up end to end, and confirm that a request with no token is refused.

## Technical notes
- Files: `src/pages/Auth.tsx`, plus `src/hooks/useAuth.tsx` where `signUp`, `signInWithPassword` and `resetPasswordForEmail` get `options.captchaToken`.
- Widget: `@marsidev/react-turnstile`. The site key is stored in code as a publishable value.
- Server: auth captcha is enabled (provider turnstile) through the auth configuration tool with the user's secret.
- Google / Lovable sign-in buttons go through their own provider checks and need no token.
- The existing database trigger blocking "keyhunt"/"probe" emails is kept.
