# ORANGE Supabase Auth setup

The Android app uses the custom callback `orange://auth/callback` for email confirmation and password recovery.

## Required Supabase dashboard configuration

1. Open **Authentication → URL Configuration** for the ORANGE project.
2. Set **Site URL** to `orange://auth/callback`.
3. Add `orange://auth/callback` to **Additional Redirect URLs** and save.
4. Open **Authentication → Email Templates**. Keep Supabase's standard confirmation link (`{{ .ConfirmationURL }}`) if using the default template. If a custom template builds its own link, it must use the requested redirect destination (`{{ .RedirectTo }}`) rather than hard-coding `{{ .SiteURL }}`.
5. Send a fresh signup confirmation and password-reset email after saving. Old emails may still contain the previous localhost destination.

## App-side support

- Android registers `orange://auth/callback` in `app.json`.
- Supabase JS uses PKCE and persists the verifier/session in AsyncStorage.
- The app handles PKCE `code`, `token_hash`, and implicit token-fragment callbacks.
- Password recovery is handled through Supabase's `PASSWORD_RECOVERY` auth event and the in-app new-password form.

## Release verification still required

A successful CI build proves compilation, APK signature verification, and ARMv7/ARM64 packaging. It does not prove that a real email provider opens the installed app, nor does it certify Google Play Protect. Complete the signup, resend-confirmation, sign-in, password-reset, chat, media, and voice-note checks on a physical Android device before calling the release production-ready.
