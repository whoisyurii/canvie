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
| `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` | *(required)* | Comma-separated list of `wss://` signaling server URLs. Provide at least three endpoints for redundancy. Falls back to the public Y.js server only when unset in development. |
| `NEXT_PUBLIC_WEBRTC_ROOM_KEY` | *(unset)* | Optional shared secret that acts as a passphrase for the room. When set, all peers must provide the same value. |
| `NEXT_PUBLIC_ICE_SERVERS` | `[]` | Optional JSON array of TURN/STUN servers passed to the WebRTC peer connection (e.g. `[{"urls":"turn:turn.example.com","username":"user","credential":"pass"}]`). |

Additional notes:

- Rooms accept IDs containing letters, numbers, underscores, and hyphens (up to 64 characters).
- WebRTC meshes work best with up to ~6 participants. Larger rooms may see degraded performance on slower networks.
- In development mode a “Collaboration Debug” panel appears in the bottom-left corner showing transport status, peer counts, signaling endpoints (with last message timestamps and retry counters), and awareness/update statistics. Logging is automatically enabled via `localStorage.log = "y-webrtc"` for verbose transport traces.

### Dedicated signaling servers

The repository ships with a [`signaling/`](./signaling/README.md) folder containing a Dockerized `y-webrtc` server ready for Fly.io, Railway, or any Docker host. Deploy three or more instances (e.g. `wss://realitea-signal-{1,2,3}.fly.dev`) and list all URLs in `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS`. The client automatically rotates across the list and will fall back when an endpoint is unavailable.

### TURN / ICE configuration

When peer-to-peer WebRTC traffic is blocked (corporate firewalls, CGNAT), provide `NEXT_PUBLIC_ICE_SERVERS` with a JSON array of TURN/STUN entries:

```bash
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"turn:turn.example.com","username":"user","credential":"pass"}]'
```

The value is forwarded to the underlying `RTCPeerConnection` (`simple-peer` `config.iceServers`). Leave it empty for direct peer connections.

### Diagnostics & logging

- Open DevTools → Application → Local Storage to confirm `log = "y-webrtc"` is set. This enables verbose transport logs from the `lib0` stack.
- The in-app debug widget surfaces peer counts, awareness stats, signaling status, last message timing, and retry counters for each signaling endpoint.

### Deploying to Vercel

1. Create a new Vercel project and connect this repository.
2. Configure `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` with the `wss://` URLs of your deployed signaling servers (add 3–5 comma-separated endpoints). Optionally set `NEXT_PUBLIC_ICE_SERVERS` if you operate TURN infrastructure. No Redis or additional stateful services are required.
3. Deploy — Vercel’s standard build (`npm run build`) and start (`npm start`) commands work out of the box.
4. Share room links (`/r/<roomId>`) with collaborators. Presence and drawings will sync across all regions.

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
- **WebRTC Signaling**: Requires deploying and maintaining at least one signaling endpoint (see [`signaling/`](./signaling/README.md)); plan for redundancy.
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
