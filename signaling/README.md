# Realitea Canvas Signaling Service

This package bundles the stateless [`y-webrtc`](https://github.com/yjs/y-webrtc) signaling server for deployments on your own infrastructure. Running your own WebRTC signaling removes the dependency on the shared public servers and keeps peer discovery reliable for the Realitea Canvas whiteboard.

## Features

- Zero application state — pure publish/subscribe signaling for WebRTC offers/answers.
- Built-in ping/pong keepalives to evict dead WebSocket connections.
- HTTP health endpoint that responds with `200 OK` at `/` for platform health checks.
- Lightweight Docker image based on `node:20-alpine` (~60MB compressed).

## Local development

```bash
cd signaling
npm install
npm start
```

The server listens on `PORT` (defaults to `4444`) and accepts secure WebSocket connections at `ws://localhost:4444` or `wss://` when placed behind TLS. The root HTTP endpoint (`GET /`) returns `okay` and can be used for uptime probes.

## Deploying

### Fly.io

1. Install [`flyctl`](https://fly.io/docs/hands-on/install-flyctl/).
2. From the repository root, run:
   ```bash
   cd signaling
   fly launch --name <your-signal-app> --no-deploy --copy-config
   ```
3. When prompted, select the existing `Dockerfile`. Open the generated `fly.toml` and ensure the service section exposes port `4444`:
   ```toml
   [[services]]
     internal_port = 4444
     processes = ["app"]
     protocol = "tcp"
     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443
   ```
4. Deploy:
   ```bash
   fly deploy
   ```
5. Repeat the deploy with unique app names (e.g. `realitea-signal-1`, `realitea-signal-2`, `realitea-signal-3`) to build a redundant pool of endpoints. Each deployment provides a `wss://` URL that you can plug into `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS`.

### Railway

1. Create a new service on [Railway](https://railway.app/) and select “Deploy from GitHub”.
2. Point the build to the `/signaling` directory and enable the Dockerfile build option.
3. Railway automatically injects a `PORT` environment variable — no additional config is required. The container listens on that port.
4. After deployment, grab the generated domain (e.g. `wss://realitea-signal.up.railway.app`) and add it to `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS`.

### Other platforms

Any platform that can run the provided Docker image works:

```bash
docker build -t realitea-signal ./signaling
docker run -p 4444:4444 realitea-signal
```

Place the container behind TLS termination (Fly.io, Railway, Render, Nginx, etc.) so that clients can connect via `wss://` from secure origins.

## Configuration Summary

- `PORT` *(optional)* — listening port. Defaults to `4444`.
- TLS termination is required for production deployments to avoid mixed-content blocking in browsers.
- Deploy at least 3 independent instances and list all `wss://` URLs in `NEXT_PUBLIC_WEBRTC_SIGNALING_URLS` so Realitea Canvas can fall back when one endpoint is unreachable.

Once deployed, update your application environment:

```bash
NEXT_PUBLIC_WEBRTC_SIGNALING_URLS="wss://realitea-signal-1.fly.dev,wss://realitea-signal-2.fly.dev,wss://realitea-signal-3.fly.dev"
```

Optionally add TURN servers for restrictive networks via `NEXT_PUBLIC_ICE_SERVERS` (see the main README for details).
