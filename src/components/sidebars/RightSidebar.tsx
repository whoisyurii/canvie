import { useState } from "react";
import { Users, FileText, ChevronRight } from "lucide-react";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export const RightSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { users, uploadedFiles } = useWhiteboardStore();

  if (isCollapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="floating-panel tool-button"
        onClick={() => setIsCollapsed(false)}
      >
        <ChevronRight className="h-5 w-5 rotate-180" />
      </Button>
    );
  }

  return (
    <div className="floating-panel w-[280px] h-[400px]">
      <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
        <h3 className="text-sm font-semibold text-sidebar-foreground">Collaboration</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="participants" className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-sidebar-accent">
          <TabsTrigger value="participants" className="text-xs">
            <Users className="h-4 w-4 mr-1" />
            Participants
          </TabsTrigger>
          <TabsTrigger value="files" className="text-xs">
            <FileText className="h-4 w-4 mr-1" />
            Files
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="p-3 mt-0">
          <ScrollArea className="h-[300px]">
            {users.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No other participants
              </p>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm text-sidebar-foreground">{user.name}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="files" className="p-3 mt-0">
          <ScrollArea className="h-[300px]">
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground mb-2">No files uploaded</p>
                <p className="text-xs text-muted-foreground">
                  Drag & drop images, PDFs, or text files onto the canvas
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-sidebar-accent transition-colors cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-accent" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-sidebar-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
