# Nomad Path — lightning talk assets

Two self-contained title cards for the talk. Each is a single HTML file that opens
straight in a browser via `file://` — no server, no build, no network. Made to run
full-screen off the laptop while mirroring to the projector.

## The cards
- **`title-card.html`** — opening card. Sunset travel poster; GPS tracks + a flight
  arc trace themselves on.
- **`thank-you.html`** — closing / Q&A resting card. Same poster with the journey
  already complete, plus the GitHub link and a QR code.

## On stage
- Open the file and press **F11** for full-screen.
- The track animation **replays on Space / Enter / R / click**, and auto-replays when
  the window regains focus. So: have it open, plug in, and tap **Space** when you're
  ready — the tracks draw on live while you speak.
- Rendering is deterministic (seeded), so it looks identical every run.

## Finalising the GitHub link (`thank-you.html`)
The repo URL is currently a placeholder: `github.com/your-handle/nomad-path`.
Once the repo is pushed, two things to update:

1. **The visible URL** — the text inside `<span class="url">…</span>` in the `.link`
   block.
2. **The QR code** — regenerate it for the real URL and replace the `<path …/>`
   inside the `.qr` `<svg>`:

   ```bash
   npm i qrcode            # or use: npx --yes qrcode ...
   node -e "require('qrcode').toString('https://github.com/<handle>/nomad-path', \
     {type:'svg', errorCorrectionLevel:'M', margin:0}, (e,s)=>console.log(s))"
   ```

   From the output, copy the **modules** path (`<path stroke="#000000" d="…"/>`) into
   `.qr`'s `<svg>`, changing the stroke to `#1a1330` to match the palette. Leave the
   light card padding — that's the QR's quiet zone.

Simplest option: hand off your GitHub handle and have both swapped in one go.
