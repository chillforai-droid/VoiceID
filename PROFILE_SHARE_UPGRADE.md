# VoiceID Profile Sharing & Acquisition Upgrade

Implemented:
- Rich profile sharing with display name, VoiceID username, bio and profile URL.
- Profile URL includes a lightweight `ref=<username>` referral hint.
- Public `/u/:username` profile shows avatar, name, VoiceID, bio, online/offline state and a clear friend-request CTA.
- Logged-out visitors get Create VoiceID / Sign in actions; after authentication they are returned to the shared profile.
- Existing contacts trigger the existing database notification system when a friend request is sent.
- Native Web Share API is used when available; clipboard fallback is provided.
- Dynamic Open Graph/Twitter image uses the profile avatar when the profile page is rendered.
- No email, phone number, or other private account data is exposed by the share text/card.

Build note:
The project source was checked after the changes. Full npm build could not be executed in this environment because the configured package registry currently returns 404 for zod@4.4.3. No source changes were made to work around that dependency issue.
