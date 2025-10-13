declare module "y-webrtc" {
  import type { Awareness } from "y-protocols/awareness";
  import type * as Y from "yjs";

  export interface WebrtcProviderOptions {
    awareness?: Awareness;
    signaling?: string[];
    password?: string;
    maxConns?: number;
    filterBcConns?: boolean;
    peerOpts?: Record<string, unknown>;
  }

  export class WebrtcProvider {
    constructor(roomName: string, doc: Y.Doc, opts?: WebrtcProviderOptions);
    awareness: Awareness;
    connect(): void;
    disconnect(): void;
    destroy(): void;
    on(event: "status", callback: (event: { status: "connected" | "disconnected" }) => void): void;
    on(event: "peers", callback: (event: { webrtcPeers: Map<number, unknown>; bcPeers: Set<number> }) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: "status", callback: (event: { status: "connected" | "disconnected" }) => void): void;
    off(event: "peers", callback: (event: { webrtcPeers: Map<number, unknown>; bcPeers: Set<number> }) => void): void;
    off(event: string, callback: (...args: any[]) => void): void;
  }
}
