import { useParams } from "react-router-dom";
import { WhiteboardCanvas } from "@/components/canvas/WhiteboardCanvas";
import { TopToolbar } from "@/components/toolbars/TopToolbar";
import { LeftSidebar } from "@/components/sidebars/LeftSidebar";
import { RightSidebar } from "@/components/sidebars/RightSidebar";
import { BottomBar } from "@/components/toolbars/BottomBar";
import { CollaborationProvider } from "@/components/collaboration/CollaborationProvider";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();
  useKeyboardShortcuts();

  if (!roomId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg">Invalid room ID</p>
      </div>
    );
  }

  return (
    <CollaborationProvider roomId={roomId}>
      <div className="relative h-screen w-full overflow-hidden bg-[hsl(var(--bg-board))]">
        {/* Main Canvas */}
        <WhiteboardCanvas />

        {/* Top Toolbar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <TopToolbar />
        </div>

        {/* Left Settings Sidebar */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40">
          <LeftSidebar />
        </div>

        {/* Right Participants/Files Sidebar */}
        <div className="absolute right-4 top-20 z-40">
          <RightSidebar />
        </div>

        {/* Bottom Zoom/Undo Bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
          <BottomBar />
        </div>
      </div>
    </CollaborationProvider>
  );
};

export default Room;
