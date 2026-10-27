# Signal

Black screen with a terminal-green eye (webcam look + blink) and an audio-reactive line about one-third up from the bottom.

## Run

```bash
npm install
npm run dev
```

Open **http://localhost:5173/** (or the port Vite prints).

1. Run `npm run dev` and open the **https://** URL (Local or Network)
2. Accept the self-signed certificate warning if shown
3. Allow the **webcam** when prompted (pupil tracking)
4. Audio:
   - **Desktop:** Capture system audio → Entire screen + Share system audio
   - **Phone / other device:** Use microphone (system capture often isn’t available)

> Other devices must use the **https://192.168.x.x:5173** Network URL. Plain `http://` blocks camera and audio capture.

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | Start the Vite dev server  |
| `npm run build`   | Production build           |
| `npm run preview` | Preview the production build |
