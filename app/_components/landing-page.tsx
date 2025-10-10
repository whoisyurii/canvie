"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Layers, MousePointer2, Sparkles, Users, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const adjectives = [
  "Aurora",
  "Velvet",
  "Crystal",
  "Echo",
  "Solar",
  "Pixel",
  "Nimbus",
  "Lunar",
];

const nouns = [
  "Canvas",
  "Meadow",
  "Pulse",
  "Orbit",
  "Summit",
  "Wave",
  "Studio",
  "Light",
];

const cursorConfigs = [
  {
    position: "top-16 left-20",
    driftX: "16px",
    driftY: "-10px",
    duration: "14s",
    delay: "0s",
    color: "text-destructive",
  },
  {
    position: "top-24 right-24",
    driftX: "-18px",
    driftY: "14px",
    duration: "16s",
    delay: "-3s",
    color: "text-blue-500",
  },
  {
    position: "top-[70%] left-[58%] sm:top-[60%] sm:left-[62%]",
    driftX: "20px",
    driftY: "18px",
    duration: "17s",
    delay: "-6s",
    color: "text-green-500",
  },
];

const features = [
  {
    icon: Users,
    title: "Live multi-player",
    description: "Invite teammates and sketch together without any setup steps.",
  },
  {
    icon: Layers,
    title: "Infinite canvas",
    description: "Organize flows, diagrams, and storyboards on a boundless board.",
  },
  {
    icon: Wand2,
    title: "Smart tools",
    description: "Drop in templates, align elements, and keep ideas tidy instantly.",
  },
];

function generateName(seed: number) {
  const adjective = adjectives[seed % adjectives.length];
  const noun = nouns[(seed * 3) % nouns.length];
  return `${adjective} ${noun}`;
}

export default function LandingPage() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const cursorNames = useMemo(
    () => cursorConfigs.map((_, index) => generateName(index + 1)),
    [],
  );

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
    <div className="landing-radial-dots relative flex h-svh min-h-svh flex-col overflow-hidden bg-[hsl(var(--bg-board))]">
      <div className="pointer-events-none absolute inset-0">
        {cursorConfigs.map((config, index) => (
          <AnimatedCursor key={config.position} name={cursorNames[index]} {...config} />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-between px-6 py-12">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="rounded-full border border-border/40 bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur">
            Real-time collaboration, no sign-up required
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Your team&apos;s whiteboard for everything
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
            Open a fresh canvas in seconds and start sketching ideas together. Spin up rooms, share a link, and begin drawing instantly—no accounts or friction.
          </p>

          <div className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Button
              size="lg"
              onClick={createRoom}
              className="h-12 min-w-[12rem] text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Create new room
            </Button>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                joinRoom();
              }}
              className="flex w-full flex-col gap-3 sm:flex-row"
            >
              <Input
                placeholder="Have a room code?"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                className="h-12 flex-1"
              />
              <Button
                type="submit"
                size="lg"
                disabled={!roomId.trim()}
                className="h-12 sm:min-w-[8rem]"
              >
                Join room
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-12 grid gap-4 pb-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/70 p-4 text-left backdrop-blur"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <feature.icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type AnimatedCursorProps = {
  name: string;
  position: string;
  driftX: string;
  driftY: string;
  duration: string;
  delay: string;
  color: string;
};

function AnimatedCursor({
  name,
  position,
  driftX,
  driftY,
  duration,
  delay,
  color,
}: AnimatedCursorProps) {
  const style = {
    "--drift-x": driftX,
    "--drift-y": driftY,
    "--drift-duration": duration,
    "--drift-delay": delay,
  } as CSSProperties;

  return (
    <div
      className={`cursor-float absolute flex flex-col items-center gap-2 ${position}`}
      style={style}
    >
      <span className="rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow">
        {name}
      </span>
      <MousePointer2 className={`h-5 w-5 drop-shadow-lg ${color}`} aria-hidden />
    </div>
  );
}
