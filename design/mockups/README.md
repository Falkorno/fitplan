# Stride UI Lab

Run the interactive mockup separately from the current application:

```powershell
npm run dev:mockup
```

Open `http://localhost:5176/mockup.html`.

## Isolation rules

- UI experiments belong in `src/mockup/`.
- The mockup uses hard-coded, in-memory data only.
- It does not import the production app, storage, Firebase, Strava sync, or service-worker bootstrap.
- Refreshing the page resets every mock interaction.
- The normal `npm run build` uses `index.html`, so `mockup.html` is not included in the production build.
- Do not copy mockup changes into production components until the design is explicitly approved.

The reference image is `stride-mobile-ui-direction-v1.png` in this directory.