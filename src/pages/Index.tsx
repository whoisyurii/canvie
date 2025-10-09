import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Users } from "lucide-react";

const Index = () => {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    const newRoomId = nanoid(10);
    navigate(`/r/${newRoomId}`);
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      navigate(`/r/${roomId.trim()}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--bg-board))]">
      <div className="max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sidebar mb-4">
            <Pencil className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Collaborative Whiteboard</h1>
          <p className="text-muted-foreground">
            Create or join a room to start drawing together in real-time
          </p>
        </div>

        <div className="space-y-4">
          <Button
            size="lg"
            className="w-full h-12 text-lg bg-accent hover:bg-accent/90"
            onClick={createRoom}
          >
            <Pencil className="mr-2 h-5 w-5" />
            Create New Room
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[hsl(var(--bg-board))] px-2 text-muted-foreground">
                Or join existing
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter room code"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && joinRoom()}
              className="h-12"
            />
            <Button size="lg" onClick={joinRoom} disabled={!roomId.trim()} className="h-12">
              <Users className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-sidebar/10 border border-sidebar-border">
          <h3 className="text-sm font-semibold mb-2 text-foreground">Features</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Real-time collaboration with cursors</li>
            <li>• Drawing tools: shapes, pen, text, arrows</li>
            <li>• Drag & drop images and files</li>
            <li>• Infinite canvas with zoom & pan</li>
            <li>• Undo/redo support</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Index;
