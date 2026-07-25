# VoiceID

VoiceID is a secure, username-based communication platform that allows users to connect, message, and talk without sharing their personal phone numbers.

## V1 Features

- Authentication
- VoiceID/user profiles
- Profile avatars
- User search
- Contacts/friends
- Realtime text messaging
- Voice messages
- Realtime notifications
- Online presence
- WebRTC voice calling

## Technology Stack

- React (19+)
- TypeScript
- Vite
- Supabase (PostgreSQL, Realtime, Auth)
- WebRTC
- Cloudinary
- Vercel (Deployment)

## Architecture

- **Frontend**: React SPA
- **Authentication**: Supabase Auth
- **Database**: PostgreSQL (Supabase)
- **Realtime**: Supabase Realtime
- **Media storage**: Cloudinary
- **Voice calling**: WebRTC / Supabase Realtime Signaling

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CLOUDINARY_CLOUD_NAME`

## Local Development

```bash
npm install
npm run dev
```

## Production

Production domain: https://voiceid.online

## V1 Status

V1 functionality is fully implemented and verified.
