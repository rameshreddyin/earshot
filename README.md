# Earshot · Neighbourhood Noise Map

> Hear a street before you sign the lease.

**Problem.** Renters cannot tell how noisy an area is during the day and at night until after they move in.
**Product.** A free map that estimates day and night noise for any spot from open data, and lets people who live there add what they actually hear.

## What it does

- **Coloured streets**: every street and rail line is drawn in its estimated noise colour (Apple system green, yellow, orange, red, purple), so the base map stays sharp. The model also counts bars, clubs, schools, places of worship, construction, industry, markets and runways. Parks lower the estimate slightly.
- **Day / Night switch** recolours the streets for sleep-time noise.
- **Spot report**: tap anywhere or search an address to get:
  - the average level with an everyday comparison ("like a busy restaurant") on a simple scale
  - day vs night levels against WHO guidelines (53 dB day, 45 dB night)
  - **Sleep** and **Work from home** verdicts
  - a 24 hour bar chart
  - the top noise sources with distance
  - "Before you sign" tips for viewing the flat at the right time
  - community reports within 400 m
- **Community reports**: noise type, worst time of day, how loud it feels, an optional 10 second **microphone reading**, and a note.
- **Shareable links**: the URL keeps the map view, the selected spot and day/night.

## Design

Apple-style interface: system font, Apple greys and blue, solid white surfaces, segmented controls and configurator-style option tiles. No glass, no animations.

On phones the map is full screen and fully interactive, with search and Day/Night floating on top and the details in a bottom sheet that snaps between three heights (drag or tap the handle).

## Free data and services (no API keys)

| Need | Service | Notes |
| --- | --- | --- |
| Basemap | [OpenFreeMap](https://openfreemap.org) (Positron and Dark styles) | Free, no key, no limits |
| Noise sources | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) on OpenStreetMap | Falls back across 3 public servers, cached in the browser for 14 days |
| Address search | [Photon](https://photon.komoot.io) by Komoot | OpenStreetMap based geocoder |
| Map rendering | MapLibre GL JS 4.7 | Open source |
| Icons / font | Lucide; Apple system font (SF Pro) with Inter as the free fallback | |
| Shared reports (optional) | Supabase free tier | Without it, reports are saved in the visitor's browser |

## How the estimate works

Each mapped source has a level at 10 m and an hourly activity profile (traffic rush hours, nightlife peaking at 11 PM, temple loudspeakers at dawn and dusk, school runs, and so on). Levels fall with distance (line sources 3 dB per doubling, point sources 6 dB, plus up to 14 dB of screening behind buildings). All sources plus a city background hum are summed energetically per hour; day is 7 AM to 10 PM and night 10 PM to 7 AM. It is a screening estimate, not a measurement, which is why community reports matter.

Tune the numbers in `js/noise-model.js` (`CATS` and `PROFILES`).

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. There is no build step.

When you publish an update, bump the `?v=` number on the file links in `index.html` and the imports in `js/` so returning visitors don't mix cached old files with new ones.

## Deploy for free

Any static host works. Pick one:

- **Netlify**: drag this folder onto https://app.netlify.com/drop
- **Cloudflare Pages**: Create project > Direct upload > select this folder
- **Vercel**: `npx vercel` in this folder
- **GitHub Pages**: push the folder to a repo, then Settings > Pages > Deploy from branch

## Turn on shared community reports (optional, 5 minutes)

1. Create a free project at https://supabase.com
2. SQL Editor > paste `supabase.sql` > Run
3. Project Settings > API: copy the **Project URL** and **anon public** key into `js/config.js`
4. Redeploy. Reports are now public, anonymous and visible to everyone.

## Roadmap ideas

- Official strategic noise maps where they exist (EU EEA END data, UK DEFRA) as a "measured" layer
- Upvote "I hear this too" on reports, and moderation
- Weekend vs weekday toggle
- Compare two flats side by side
