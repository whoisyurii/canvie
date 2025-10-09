# Collaborative Whiteboard

A real-time collaborative whiteboard application built with React, TypeScript, and Y.js. Draw, create shapes, add text, and collaborate with others in real-time with an infinite canvas.

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

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **react-konva** for canvas rendering
- **Y.js + y-webrtc** for real-time collaboration
- **Zustand** for state management
- **React Router** for navigation

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone <your-repo-url>

# Navigate to the project directory
cd collaborative-whiteboard

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`

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
├── pages/               # Route pages (Index, Room)
└── index.css            # Global styles and design system

```

## Design System

The app uses a warm, creative color palette:

- **Canvas**: Parchment background (#f6eedc)
- **Toolbars/Sidebars**: Dark gray (#444436)
- **Accents**: Warm brown/orange tones
- **Semantic tokens**: All colors defined in `index.css`

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
