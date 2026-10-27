# Signal

Black screen with a terminal-green eye (webcam look + blink) and an audio-reactive line about one-third up from the bottom.

## Run

```bash
npm install
npm run dev
```

Open **http://localhost:5173/** (or the port Vite prints).

1. Allow the **webcam** when prompted (pupil tracking)
2. Click **Capture system audio**
3. Choose **Entire screen** and enable **Share system audio**
4. Play anything on the machine — the green line should move

> Web pages cannot silently tap the speaker loopback. Chrome/Edge on Windows: **Entire screen + Share system audio** is the supported path for full system output.

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | Start the Vite dev server  |
| `npm run build`   | Production build           |
| `npm run preview` | Preview the production build |
