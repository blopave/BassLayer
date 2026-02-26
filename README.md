# BassLayer v1.5

Buenos Aires electronic music events + crypto news aggregator.

## What's New in v1.5

- **Swipe navigation** between Bass ↔ Layer (touch + keyboard arrows)
- **Sumar evento** — submit form (FAB button + CTA at end of feed)
- **Layer split layout** — news feed (left) + crypto events BA (right)
- **Crypto events BA** — meetups, hackathons, conferences in Buenos Aires
- **POST /api/submit-event** — event submission endpoint
- **GET /api/crypto-events** — crypto events data

## Architecture

```
Browser ↔ Frontend (React+Vite :3000) ↔ Backend (Express :3001) ↔ External
```

### Frontend (~850 lines BassLayer.jsx)
- **Home**: split hover, canvas animations, circular wipe transitions
- **Bass**: swipe panel, event feed, genre filters, event modal, submit form
- **Layer**: swipe panel, price ticker, split layout (news + crypto events)

### Backend (~560 lines server.js)
- `GET /api/prices` — CoinGecko → cache 30s
- `GET /api/news` — 6 RSS feeds → cache 5min → filter by `?tag=BTC`
- `GET /api/events` — Buenos Aliens → RA → fallback → cache 1h → `?genre=Techno`
- `GET /api/crypto-events` — Crypto events in Buenos Aires
- `POST /api/submit-event` — User event submissions
- `GET /api/submissions` — Pending submissions list
- `GET /api/meta` — Available tags/genres/types
- `GET /api/health` — Server status

### Event Sources (cascade)
1. Buenos Aliens HTML scraper (primary)
2. RA GraphQL API (fallback)
3. RA HTML __NEXT_DATA__ scraper (fallback)
4. Curated static events (emergency fallback)

## Quick Start

```bash
npm install
npm run dev        # API :3001 + Vite :3000
```

## Production

```bash
npm run build
npm start          # Express serves API + static from /dist
```

## Preview

Open `preview.html` in any browser to see the full UI with mock data (no backend needed).

```bash
npm run preview    # Opens preview.html
```

## Project Structure

```
basslayer-clean/
├── server.js          # Express API v1.5
├── src/
│   ├── main.jsx       # React entry
│   └── BassLayer.jsx  # Full app
├── preview.html       # Standalone preview (mock data)
├── index.html         # Vite entry
├── vite.config.js     # Vite + proxy config
├── package.json
└── README.md
```

## API Examples

```bash
# Get events
curl http://localhost:3001/api/events
curl http://localhost:3001/api/events?genre=Techno

# Get crypto events
curl http://localhost:3001/api/crypto-events

# Submit event
curl -X POST http://localhost:3001/api/submit-event \
  -H "Content-Type: application/json" \
  -d '{"name":"My Event","date":"2025-03-15","venue":"Club X","genre":"Techno","artists":["DJ A","DJ B"],"section":"bass"}'

# Check health
curl http://localhost:3001/api/health
```
