"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Layers, MousePointer2, Sparkles, Users, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { liftedSurfaceBase } from "@/lib/lifted-ui";
import { cn } from "@/lib/utils";

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

const floatingCursorConfigs = [
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

const ctaCursorConfig = {
  position:
    "left-1/2 top-[calc(100%+1.75rem)] -translate-x-1/2 sm:left-1/2 sm:top-[calc(100%+1.25rem)]",
  driftX: "4px",
  driftY: "6px",
  duration: "13s",
  delay: "-8s",
  color: "text-purple-500",
};

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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const cursorNames = useMemo(() => {
    const configs = [...floatingCursorConfigs, ctaCursorConfig];
    return configs.map((_, index) => generateName(index + 1));
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const navigateWithTransition = (path: string) => {
    if (isTransitioning) {
      return;
    }

    setIsTransitioning(true);
    transitionTimeoutRef.current = setTimeout(() => {
      router.push(path);
    }, 220);
  };

  const createRoom = () => {
    const newRoomId = nanoid(10);
    navigateWithTransition(`/r/${newRoomId}`);
  };

  const joinRoom = () => {
    const rawInput = roomId.trim();
    if (!rawInput) {
      return;
    }

    const extractRoomId = (value: string) => {
      const pathMatch = value.match(/\/?r\/([^/?#]+)/i);
      if (pathMatch?.[1]) {
        return decodeURIComponent(pathMatch[1]);
      }
      return null;
    };

    let nextRoomId = rawInput;

    if (rawInput.includes("/")) {
      const fromPath = extractRoomId(rawInput);
      if (fromPath) {
        nextRoomId = fromPath;
      }
    }

    if (rawInput.includes("://") || rawInput.includes(".")) {
      try {
        const url = rawInput.includes("://")
          ? new URL(rawInput)
          : new URL(`https://${rawInput}`);
        const fromUrl = extractRoomId(url.pathname);
        if (fromUrl) {
          nextRoomId = fromUrl;
        }
      } catch {
        // Ignore parsing errors and fall back to the raw input.
      }
    }

    navigateWithTransition(`/r/${nextRoomId}`);
  };

  return (
    <div
      className={cn(
        "landing-radial-dots relative flex h-svh min-h-svh flex-col overflow-hidden bg-[hsl(var(--bg-board))]",
        isTransitioning && "landing-create-transition pointer-events-none",
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        {floatingCursorConfigs.map((config, index) => (
          <AnimatedCursor key={config.position} name={cursorNames[index]} {...config} />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-between px-6 py-12">
        <div className="landing-hero-animate flex flex-1 flex-col items-center justify-center text-center">
          <div className="rounded-full border border-border/40 bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur">
            Real-time collaboration, no sign-up required
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Your team&apos;s whiteboard for everything
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
            Open a fresh canvas in seconds and start sketching ideas together. Spin up rooms, share a link, and begin drawing instantly—no accounts or friction.
          </p>

          <div className="mt-10 flex w-full justify-center">
            <div
              className={cn(
                liftedSurfaceBase,
                "landing-cta-animate flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border/60 bg-card/90 p-3 shadow-[0_22px_45px_-24px_rgba(15,23,42,0.55)] backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4",
              )}
            >
              <div className="relative sm:w-auto">
                <Button
                  size="lg"
                  onClick={createRoom}
                  disabled={isTransitioning}
                  className="h-12 w-full min-w-[12rem] rounded-xl border border-border/60 bg-primary/90 px-6 text-base shadow-[0_20px_42px_-22px_rgba(15,23,42,0.65)] transition-transform hover:-translate-y-0.5 hover:bg-primary focus-visible:-translate-y-0.5 sm:w-auto"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  Create new room
                </Button>
                <AnimatedCursor name={cursorNames[3]} {...ctaCursorConfig} />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  joinRoom();
                }}
                className="flex w-full flex-col gap-3 sm:flex-1 sm:flex-row sm:items-center"
              >
                <Input
                  placeholder="Paste a room link or code"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  disabled={isTransitioning}
                  className="h-12 flex-1 rounded-xl border border-border/60 bg-background/80 px-4 text-base shadow-[0_18px_38px_-24px_rgba(15,23,42,0.55)] backdrop-blur placeholder:text-muted-foreground/80 focus-visible:ring-ring/70 focus-visible:ring-offset-0 sm:text-base"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!roomId.trim() || isTransitioning}
                  className="h-12 w-full rounded-xl border border-border/60 bg-secondary/90 px-6 text-base shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-secondary focus-visible:-translate-y-0.5 sm:w-auto sm:min-w-[8rem]"
                >
                  Join room
                </Button>
              </form>
            </div>
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
      className={`pointer-events-none cursor-float absolute flex flex-col items-center gap-2 ${position}`}
      style={style}
    >
      <span className="rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow">
        {name}
      </span>
      <MousePointer2 className={`h-5 w-5 drop-shadow-lg ${color}`} aria-hidden />
    </div>
  );
}
