[![CodeQL](https://github.com/${{ github.repository }}/actions/workflows/codeql.yml/badge.svg)](https://github.com/${{ github.repository }}/actions/workflows/codeql.yml)

# Collaborative Whiteboard

A real-time collaborative whiteboard application built with Next.js, TypeScript, and Y.js. Draw, create shapes, add text, and collaborate with others in real-time with an infinite canvas.

> Merges to `main` require passing CodeQL code scanning results. Alerts of *High* severity or higher block merges.

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

# Boot the Worker (Durable Object signaling) alongside Next.js
npm run dev
```

The Next.js frontend runs at `http://localhost:3000` and the local signaling Worker listens on `http://127.0.0.1:8787`.

Create a `.env.local` file before launching the app so browsers discover the Worker during development:

```
NEXT_PUBLIC_WEBRTC_SIGNALING_URLS=ws://127.0.0.1:8787/signaling
```

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
- **Participants List**: View all active collaborators alongside the canvas
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

## Cloudflare Pages + Durable Objects Deployment

Cloudflare Pages hosts the static Next.js build, while a Workers script plus Durable Object powers the WebRTC signaling layer. The Worker exposes `/health` for quick checks and `/signaling` for WebSocket upgrades. Peers are routed to room-specific Durable Object instances based on the room id embedded in the request.

### Prerequisites

- Install dev tooling:
  ```bash
  npm install --save-dev wrangler @cloudflare/workers-types npm-run-all
  ```
  The Next.js build step relies on `npx @cloudflare/next-on-pages`, so no extra dependency is needed.
- Authenticate once: `npx wrangler login`
- Ensure your Cloudflare account has a Workers and Pages project available.

### Local development workflow

1. Start the Worker + Durable Object locally:
   ```bash
   npm run dev:cf
   ```
   Wrangler serves the Worker on `http://127.0.0.1:8787` and persists Durable Object state inside `.wrangler/state` for quick reloads.
2. In another terminal, start the Next.js dev server:
   ```bash
   npm run dev:frontend
   ```
3. Visit the same `/r/<roomId>` in a normal and incognito browser window. Presence indicators and drawing updates should appear in well under 200 ms. Reload one tab to confirm reconnection behaviour remains smooth.

Prefer a single command? `npm run dev` uses `npm-run-all` to execute both `dev:cf` and `dev:frontend` in parallel.

### Build & deploy pipeline

1. **Build Next.js for Cloudflare Pages**
   ```bash
   npm run build:next
   ```
   The command shells out to `@cloudflare/next-on-pages` and emits the `.vercel/output` directory consumed by Pages.
2. **Deploy or update the signaling Worker**
   ```bash
   npm run deploy:worker
   ```
   The Worker (`cloudflare/signaling.ts`) binds the `SignalingRoom` Durable Object described in `wrangler.toml`.
3. **Publish the static bundle to Pages**
   Deploy through your connected Cloudflare Pages project or use `wrangler pages deploy` with the generated `.vercel/output/static` directory. Ensure the Pages project inherits the same environment variables defined in `wrangler.toml` so the browser loads the private signaling host by default.

### Production environment variables

Configure the following variables for your Cloudflare Pages project:

```
NEXT_PUBLIC_COLLAB_TRANSPORT=webrtc
NEXT_PUBLIC_WEBRTC_SIGNALING_URLS=wss://<your-subdomain>.workers.dev/signaling
NEXT_PUBLIC_WEBRTC_ROOM_KEY=
```

Additional fallback signaling relays can be appended by comma-separating extra URLs. Browsers always connect to the Worker first and only touch secondary relays if needed.

### Configuration blueprint

1. **Create bindings** – The provided `wrangler.toml` already binds the `ROOMS` Durable Object and includes an initial `new_sqlite_classes` migration tag `v1` so the namespace is compatible with the Cloudflare free plan.
2. **Environment variables** – `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` defaults to the Worker’s `/signaling` endpoint. Override per environment when needed; the UI still accepts comma-separated fallbacks.
3. **Route wiring** – Publish the Worker to a custom domain or use the default `<account>.workers.dev`. Pages simply consumes the prebuilt assets; no server-side rendering is required.

### Rollback plan

If you need to revert quickly, point `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` back to the public Yjs signaling relays (or a previous Worker deployment) — no code changes are required. The UI automatically reconnects using whatever list of comma-separated endpoints the environment variable exposes.

### Troubleshooting tips

- Hit `https://<worker-domain>/health` to confirm the Worker is reachable before debugging peer connections.
- Use `wrangler tail` to stream Worker and Durable Object logs during development.
- Browsers require the production endpoint to be `wss://` because the Pages frontend is served over HTTPS — mixed content will otherwise block the socket.
- If peers fail to discover each other, verify both tabs share the identical `/r/<roomId>` URL and check the console for WebRTC negotiation errors.
- Deployments on the free plan must use `new_sqlite_classes` migrations. If Wrangler returns `code: 10097`, confirm your `wrangler.toml` migration block matches the template above, then re-run `npx wrangler deploy` to provision the namespace.
- A `/stats?roomId=<roomId>` request against the Worker returns live peer counts and last-activity timestamps to help track active rooms.

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
- [v] Text editing capabilities
- [ ] More shape options (triangles, stars, etc.)
- [v] Background customization
- [v] Selection and grouping of multiple elements
- [v] Copy/paste functionality
- [v] Grid snapping

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for any purpose.
