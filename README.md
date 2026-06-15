# Promise Places PWA

Promise Places is an iOS-friendly Progressive Web App for keeping promises about shared places.

## Local development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Production build

```bash
npm run build
```

The production files are generated in `dist/`.

## Integrations

Copy `.env.example` to `.env.local` and fill what you want to enable:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_2GIS_API_KEY=
VITE_WEB_PUSH_PUBLIC_KEY=
```

### Supabase Auth, Postgres, and Storage

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
   If you already ran the earlier schema before couples were added, run `supabase/couples_upgrade.sql` once.
3. In Auth URL configuration, add your Cloudflare Pages URL as the Site URL and redirect URL.
4. Put the project URL and anon key into `.env.local`.
5. The app will use local storage when signed out and Supabase Postgres when signed in.

Storage bucket: `promise-photos`.

### 2GIS Places API

Create a 2GIS API key for Search APIs and set `VITE_2GIS_API_KEY`.
The add screen will show place suggestions and fill the address.

### Web Push for PWA

Set `VITE_WEB_PUSH_PUBLIC_KEY` to the public VAPID key. The app can create and store a push subscription.
Sending scheduled push reminders still needs a backend sender, for example a Cloudflare Worker with a Cron Trigger and the private VAPID key.

### Apple Calendar

Planned promises with an ISO date can export an `.ics` file. On iPhone, opening the file adds the event to Apple Calendar.

### Cloudflare Pages

Cloudflare Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: the same `VITE_*` values listed above

The included `wrangler.toml` also points Pages to `dist`.

## Install on iPhone without a Mac

1. Deploy the built app to an HTTPS host such as Vercel, Netlify, Cloudflare Pages, or any static hosting with HTTPS.
2. Open the HTTPS URL in Safari on iPhone.
3. Tap Share.
4. Tap Add to Home Screen.
5. Launch Promise Places from the home screen.

## iOS notes

- Offline caching needs HTTPS on the real iPhone URL.
- Web notifications on iOS work only after the site is installed as a Home Screen web app.
- This version stores promises locally on the device with `localStorage`.
