# Stride Training Planner

A mobile-friendly React training planner for running, cycling and strength work. It includes weekly planning, Strava activity data, habit tracking, training summaries and an adaptive coaching interface.

## Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

The standard development server uses Vite. The standalone design mock-up is available with:

```bash
npm run dev:mockup
```

## Checks and production build

```bash
npm test
npm run build
npm start
```

`npm start` serves the production build on port 5173 by default.

## Local configuration

Keep machine-specific configuration in `.env.local`. Environment files, personal planner exports, logs, browser test profiles, dependencies and generated builds are deliberately excluded from Git.

Firebase client configuration is part of the browser application. Firebase Authentication and the rules in `firestore.rules` must be configured before using cloud synchronisation.
