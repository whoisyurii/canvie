declare module "y-webrtc" {
  import type { Awareness } from "y-protocols/awareness";
  import type * as Y from "yjs";

  export interface SignalingConn {
    url: string;
    connected: boolean;
    connecting: boolean;
    lastMessageReceived: number;
    unsuccessfulReconnects: number;
    on(event: "connect", callback: (...args: any[]) => void): void;
    on(event: "disconnect", callback: (...args: any[]) => void): void;
    on(event: "message", callback: (...args: any[]) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: "connect", callback: (...args: any[]) => void): void;
    off(event: "disconnect", callback: (...args: any[]) => void): void;
    off(event: "message", callback: (...args: any[]) => void): void;
    off(event: string, callback: (...args: any[]) => void): void;
  }

  export interface WebrtcProviderOptions {
    awareness?: Awareness;
    signaling?: string[];
    password?: string;
    maxConns?: number;
    filterBcConns?: boolean;
    peerOpts?: {
      config?: RTCConfiguration;
      [key: string]: unknown;
    };
  }

  export class WebrtcProvider {
    constructor(roomName: string, doc: Y.Doc, opts?: WebrtcProviderOptions);
    awareness: Awareness;
    peerOpts: NonNullable<WebrtcProviderOptions["peerOpts"]>;
    signalingConns: SignalingConn[];
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
