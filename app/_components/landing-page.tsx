"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Palette, Pencil, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LandingPage() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const createRoom = () => {
    const newRoomId = nanoid(10);
    router.push(`/r/${newRoomId}`);
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      router.push(`/r/${roomId.trim()}`);
    }
  };

  return (
    <div className="landing-radial-dots flex min-h-screen items-center justify-center bg-[hsl(var(--bg-board))]">
      <div className="mx-4 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="relative mb-4 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-sidebar shadow-lg">
            <span className="absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-transparent" aria-hidden />
            <Palette aria-hidden className="h-10 w-10 text-muted-foreground/50" />
            <Pencil aria-hidden className="absolute h-8 w-8 text-accent" />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-accent/20 p-1" aria-hidden>
              <Sparkles className="h-3 w-3 text-accent" />
            </span>
          </div>
          <h1 className="mb-2 text-4xl font-bold text-foreground">Collaborative Whiteboard</h1>
          <p className="text-muted-foreground">
            Create or join a room to start drawing together in real-time
          </p>
        </div>

        <div className="space-y-4">
          <Button size="lg" className="h-12 w-full text-lg" onClick={createRoom}>
            <Pencil className="mr-2 h-5 w-5" />
            Create New Room
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-b border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[hsl(var(--bg-board))] px-2 text-muted-foreground">Or join existing</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter room code"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  joinRoom();
                }
              }}
              className="h-12"
            />
            <Button size="lg" onClick={joinRoom} disabled={!roomId.trim()} className="h-12">
              <Users className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-sidebar-border bg-sidebar/10 p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Features</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Real-time collaboration with cursors</li>
            <li>• Drawing tools: shapes, pen, text, arrows</li>
            <li>• Drag &amp; drop images and files</li>
            <li>• Infinite canvas with zoom &amp; pan</li>
            <li>• Undo/redo support</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
