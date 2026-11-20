# ORANGE Android

ORANGE is an Android-first messaging app built with Expo React Native and Supabase.

## Features
- Email/password sign-up and sign-in, unique usernames, editable profiles and avatar frames.
- Private one-to-one chats and group chats with persistent Supabase storage and realtime incoming messages.
- Sticker messages, photo sharing, voice notes, 24-hour Instants/Stories, and 24-hour Notes.
- Smart Lite mode reduces animation and media upload quality for lower-end Android devices.
- Dark premium interface with orange accents.

## Android support
- Minimum Android API: 24 (Android 7.0).
- APK includes ARMv7 (armeabi-v7a) and ARM64 (arm64-v8a).
- Build uses Expo SDK 54 / React Native 0.81.

## Build
GitHub Actions builds a release APK on pushes to main and manual dispatch. Open **Actions → ORANGE Android APK**, then download the ORANGE-Android-APK artifact.
The APK is a sideloadable CI build. For Google Play publication, configure a persistent release signing key and Play Console credentials.

## Backend
The app uses the existing ORANGE Supabase project in ap-south-1. The publishable key is intentionally client-safe; database access is protected by RLS. Never put a Supabase secret/service-role key in the app.

## Notes
Stories and Notes expire after 24 hours in app queries. A scheduled cleanup job can be added later to physically purge expired media and rows. Play Protect and real-device compatibility must be verified on actual devices; a successful build alone is not a Play Protect certification.