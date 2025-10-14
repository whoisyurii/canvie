# Collaborative Whiteboard

A real-time collaborative whiteboard application built with Next.js, TypeScript, and Y.js. Draw, create shapes, add text, and collaborate with others in real-time with an infinite canvas.

## Features

- 🎨 **Drawing Tools**: Select, Pan, Shapes (Rectangle, Ellipse), Arrows, Lines, Text, Pen, Eraser
- 👥 **Real-time Collaboration**: See other users' cursors and edits in real-time via Y.js + WebRTC
- 📁 **Drag & Drop**: Upload images, PDFs, and text files directly onto the canvas
- 🔄 **Undo/Redo**: Full history support for all canvas operations
- 🔍 **Zoom & Pan**: Infinite canvas with smooth zoom and pan controls
- ⌨️ **Keyboard Shortcuts**: Fast tool switching with hotkeys
- 🎨 **Customizable Tools**: Adjust stroke color, width, style, opacity, and more
- 📊 **Layer Management**: Control element z-order (bring to front, send to back)

## Tech Stack

- **Next.js 15** with React 19 and TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **react-konva** for canvas rendering
- **Y.js + y-webrtc** for real-time collaboration
- **Zustand** for state management

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone <your-repo-url>

# Navigate to the project directory
cd realitea-canvas

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

## Usage

### Creating a Room

1. Visit the homepage
2. Click "Create New Room"
3. Share the URL with others to collaborate

### Joining a Room

1. Get a room code/URL from someone
2. Enter the code on the homepage or visit the room URL directly
3. Start collaborating!

### Keyboard Shortcuts

- `V` - Select tool
- `H` - Pan tool
- `R` - Rectangle
- `O` - Ellipse
- `A` - Arrow
- `L` - Line
- `T` - Text
- `P` - Pen
- `E` - Eraser
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo

### Tool Settings

Use the left sidebar to customize:
- **Stroke Color**: Choose from preset colors
- **Fill Color**: Set shape fill color
- **Stroke Width**: Adjust line thickness (1-8px)
- **Stroke Style**: Solid, dashed, or dotted lines
- **Opacity**: Control element transparency
- **Layer Controls**: Manage element stacking order

### Collaboration Features

- **Real-time Cursors**: See where other users are pointing
- **Participants List**: View all active collaborators in the right sidebar
- **File Sharing**: Drag and drop files that all users can see
- **Ephemeral Rooms**: Rooms are temporary and reset after inactivity
- **Peer-to-Peer Sync**: Canvas changes and presence updates replicate over WebRTC meshes — no centralized state to scale.

### Collaboration Transport & Configuration

Collaboration is powered by [Y.js](https://github.com/yjs/yjs) with the [`y-webrtc`](https://github.com/yjs/y-webrtc) provider. The app defaults to WebRTC transport and requires no dedicated server state. Configuration happens through environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_COLLAB_TRANSPORT` | `webrtc` | Transport selection. Currently only `webrtc` is supported. |
| `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` | `wss://<your-workers-subdomain>.workers.dev/signaling` | Optional comma-separated list of signaling server URLs. Leave empty to fall back to the public Y.js servers. |
| `NEXT_PUBLIC_WEBRTC_ROOM_KEY` | *(unset)* | Optional shared secret that acts as a passphrase for the room. When set, all peers must provide the same value. |

Additional notes:

- Rooms accept IDs containing letters, numbers, underscores, and hyphens (up to 64 characters).
- WebRTC meshes work best with up to ~6 participants. Larger rooms may see degraded performance on slower networks.
- In development mode a “Collaboration Debug” panel appears in the bottom-left corner showing transport status, peer counts, and message activity.

### Deploying to Vercel

Vercel remains a simple way to host the static build if you do not need private signaling. Follow the existing steps above to deploy the UI while continuing to rely on public signaling servers.

## Cloudflare Pages + Durable Objects Deployment

Cloudflare Pages hosts the static Next.js build, while a Workers script plus Durable Object powers the WebRTC signaling layer. The Worker exposes `/health` for quick checks and `/signaling` for WebSocket upgrades. Peers are routed to room-specific Durable Object instances based on the room id embedded in the request.

### Prerequisites

- Install dev tooling:
  ```bash
  npm install --save-dev wrangler @cloudflare/workers-types npm-run-all
  ```
  The Next.js build step relies on `npx @cloudflare/next-on-pages@1.13.16 build`, so no extra dependency is needed.
- Authenticate once: `npx wrangler login`
- Ensure your Cloudflare account has a Workers and Pages project available.

### Local development workflow

1. Start the Worker + Durable Object locally:
   ```bash
   npm run dev:cf
   ```
   This boots Wrangler on `http://127.0.0.1:8787` with persisted Durable Object state under `.wrangler/state`.
2. In another terminal start the Next.js dev server:
   ```bash
   npm run dev:frontend
   ```
3. Point the whiteboard at the local signaling endpoint by adding to `.env.local`:
   ```
   NEXT_PUBLIC_WEBRTC_SIGNALING_URLS=ws://127.0.0.1:8787/signaling
   ```
4. Visit the same `/r/<roomId>` in a normal and incognito window. Cursors and strokes should sync in under 200 ms. Reload one tab to confirm reconnect behaviour.

The combined `npm run dev` script runs both processes via `run-p` if you prefer a single command.

### Build & deploy pipeline

1. **Build Next.js for Cloudflare Pages**
   ```bash
   npm run build:next
   ```
   This produces the `.vercel/output` directory expected by Pages.
2. **Deploy/upgrade the signaling Worker**
   ```bash
   npm run deploy:worker
   ```
   The Worker is defined in `cloudflare/signaling.ts` and binds the `SignalingRoom` Durable Object declared in `wrangler.toml`.
3. **Deploy the static bundle to Pages**
   ```bash
   npm run deploy:pages
   ```
   Configure the Pages project to read environment variables from `wrangler.toml` (or the dashboard) so the client defaults to the Worker signaling URL.

### Configuration blueprint

1. **Create bindings** – The provided `wrangler.toml` already binds the `ROOMS` Durable Object and includes an initial migration tag `v1`.
2. **Environment variables** – `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` defaults to the Worker’s `/signaling` endpoint. Override per environment when needed; the UI still accepts comma-separated fallbacks.
3. **Route wiring** – Publish the Worker to a custom domain or use the default `<account>.workers.dev`. Pages simply consumes the prebuilt assets; no server-side rendering is required.

### Rollback plan

- **Worker** – Use `wrangler deploy --dry-run` to validate, and `wrangler deploy --env production --rollback` (or promote a previous upload in the dashboard) to revert.
- **Pages** – Trigger a redeploy with a previous build artifact via `wrangler pages deploy <path> --commit <previous_sha>` or the UI. Updating the env var to point at the old signaling host instantly restores the previous behaviour.
- **Client fallback** – If the Worker is unavailable, remove `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` so the app falls back to the public Y.js servers without any code changes.

### Troubleshooting tips

- Check `https://<worker-domain>/health` to verify the Worker is reachable.
- Run `wrangler tail` to stream Worker/DO logs during debugging.
- Ensure browsers load the app over HTTPS so the `wss://` signaling endpoint is not blocked by mixed content rules.
- If clients fail to see each other, inspect the browser console for WebRTC negotiation errors and confirm both tabs share the same `/r/<roomId>` path.

### Manual acceptance checklist

- Two browsers (normal + incognito) in the same room show each other’s cursors in under 200 ms and drawing order is preserved.
- Reloading or toggling airplane mode forces a reconnect but peers rejoin automatically.
- Long-distance peers (e.g., via VPN) still discover each other because signaling remains centralized while media stays peer-to-peer.
- Incognito windows participate fully; BroadcastChannel is not the only discovery path.

> **Note:** The legacy Vercel deployment guide above is still accurate, but the Cloudflare workflow is now the recommended production path.

## Project Structure

```
src/
├── components/
│   ├── canvas/           # Canvas rendering components
│   ├── collaboration/    # Y.js provider and real-time logic
│   ├── sidebars/        # Left and right sidebar components
│   ├── toolbars/        # Top and bottom toolbar components
│   └── ui/              # shadcn UI components
├── hooks/               # Custom React hooks
├── lib/
│   └── store/           # Zustand store for app state
├── app/                 # Next.js App Router entrypoints
├── pages/               # Legacy routes (API, fallbacks)
└── public/              # Static assets

```

## Design System

The app uses a warm, creative color palette:

- **Canvas**: Parchment background (#f6eedc)
- **Toolbars/Sidebars**: Dark gray (#444436)
- **Accents**: Warm brown/orange tones
- **Semantic tokens**: All colors defined in `index.css`

### Tailwind "lifted" surface recipe

Modern SaaS dashboards often add a subtle top rim highlight to make cards feel three-dimensional. You can achieve the same effect in Tailwind by layering a gradient pseudo-element over a softly blurred panel. The new `LiftedCard` helper component encapsulates the effect:

```tsx
import { LiftedCard } from "@/components/ui/lifted-card";

export function Example() {
  return (
    <LiftedCard className="max-w-sm">
      <p className="text-sm text-slate-300/90">Setup required</p>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Nano Canvas</h3>
          <p className="text-xs text-slate-400/80">Layered depth for AI image creation</p>
        </div>
        <button className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950 shadow-inner shadow-amber-200/60 transition-colors hover:bg-amber-300">
          Setup
        </button>
      </div>
    </LiftedCard>
  );
}
```

If you prefer to copy the styles inline, the core class stack looks like this:

```html
<div class="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-slate-100 shadow-[0_18px_45px_-15px_rgba(15,23,42,0.85)] backdrop-blur-md before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-gradient-to-b before:from-white/80 before:via-white/20 before:to-transparent before:content-['']">
  ...
</div>
```

The thin `before` gradient creates the glossy top edge, while the deep shadow and translucent background build the layered depth.

## Known Limitations

- **No Persistence**: Rooms are ephemeral (not saved to a database)
- **WebRTC Signaling**: Uses public Y.js signaling server (may have latency)
- **File Storage**: Files are stored as object URLs (not persisted)

## Future Enhancements

- [ ] Persistent rooms with database storage
- [ ] Export canvas as PNG/SVG
- [ ] Text editing capabilities
- [ ] More shape options (triangles, stars, etc.)
- [ ] Background customization
- [ ] Selection and grouping of multiple elements
- [ ] Copy/paste functionality
- [ ] Grid snapping

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- Built with [Lovable](https://lovable.dev)
- Inspired by Excalidraw, Miro, and Figma
- Real-time collaboration powered by Y.js
