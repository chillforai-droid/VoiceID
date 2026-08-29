# Vercel Function Limit Fix

## What changed

- The project now contains exactly one file under `api/`: `api/index.ts`.
- All existing API handlers remain in `lib/api-handlers/` and are dispatched by the single function.
- Existing public API URLs are preserved by `vercel.json` rewrites.
- A defensive pathname fallback was added to the dispatcher so known API endpoints still resolve if the `route` query parameter is absent.
- The `/api/media/delete/:objectKey` path is decoded and passed to the existing ownership-checked delete handler.
- No React pages, database migrations, authentication code, media cache code, or UI components were removed.

## API routes preserved

- `/api/media/upload`
- `/api/media/upload-auth`
- `/api/media/download-auth`
- `/api/media/download`
- `/api/media/ack`
- `/api/media/delete/:objectKey`
- `/api/media/story`
- `/api/ai-reply`
- `/api/send-push`
- `/api/delete-account`
- `/api/cloudinary-sign`
- `/u/:username`

## Important deployment note

The Vercel build must install dependencies from `package-lock.json` before compiling. The source package does not include `node_modules`.

The 12-function build failure is addressed by keeping only one Vercel Function entry under `api/`.
