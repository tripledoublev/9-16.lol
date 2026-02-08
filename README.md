# 9-16.lol

Stories-style 9:16 image sharing/viewing for AT Protocol (Bluesky). The app is a static, client-only SvelteKit site that:

- Signs users in via AT Protocol OAuth (in the browser)
- Writes images to the user repo as records in the `lol.916.frame.image` collection
- Reads frames back from the PDS of each followed account

There is no backend in this repo.

## Tech

- SvelteKit (Svelte 5), `ssr = false` (client-only)
- Static deploy (`@sveltejs/adapter-static` with `fallback: index.html`)
- TailwindCSS (via `@tailwindcss/vite`)
- IndexedDB caching (Dexie)
- AT Protocol client + OAuth (`@atcute/*`)

## Local Dev

Install dependencies:

```sh
npm install
```

Run the dev server (Vite is configured for `127.0.0.1:4374`):

```sh
npm run dev
```

Open:

- `http://127.0.0.1:4374/`

Note: AT Protocol OAuth loopback redirect handling is picky; local login intentionally uses `127.0.0.1` (not `localhost`) for the redirect URI.

## Build And Preview

```sh
npm run build
npm run preview
```

Static output is generated under `build/`.

## OAuth / Deployment

Production OAuth metadata is served as a static file:

- `static/client-metadata.json` is published at `/client-metadata.json`

This repo currently hard-codes the production origin in `src/lib/at/settings.ts` (`SITE = 'https://9-16.lol'`). If you fork/deploy under a different domain, update both:

- `src/lib/at/settings.ts` (the `SITE` constant)
- `static/client-metadata.json` (`client_id`, `client_uri`, `redirect_uris`)

Local development does not use the hosted metadata document; it uses the AT Protocol OAuth loopback `http://localhost?...` `client_id` form constructed at runtime (see `src/lib/at/oauth.svelte.ts`).

Because this is an SPA with client-side routing and an adapter static fallback, your host must serve `index.html` for unknown paths (so routes like `/login`, `/post`, `/profile/...` work on refresh).

## Data Model

Frames are stored in the user repo as records in `lol.916.frame.image` (see `lexicons/lol.916.frame.image.json`).

If you change the collection name or requested permissions, update `src/lib/at/settings.ts` (permissions/scope generation) and `static/client-metadata.json` (scope string) together.

Record fields:

- `createdAt` (required)
- `image` blob (required, max 2MB, accepts jpeg/webp/png)
- `text` (optional caption, max 240 chars)
- `alt` (optional alt text, max 300 chars)
- `aspect` (optional: `9:16`, `original`, `other`)
- `expiresAt` (optional datetime)

When posting, the app crops to 9:16 and compresses to a JPEG under the 2MB limit (see `src/lib/media/image.ts`).

## Feed Behavior

On the home screen, the app:

- Loads up to 150 followed accounts (via `https://public.api.bsky.app`)
- Resolves each follow's PDS from their DID document, then lists records from `lol.916.frame.image`
- Fetches an initial page of frames per author concurrently, then sorts authors by newest frame time

Some lookups are cached in IndexedDB with TTLs (DID docs, PDS endpoints, follows, profiles, seen-state) in `src/lib/cache/db.ts`.
