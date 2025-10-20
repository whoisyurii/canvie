"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Settings2, Sparkles, Undo2, Workflow } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  GeminiMissingKeyError,
  GeminiResponseError,
  type GeminiChatMessage,
  useGeminiChat,
} from "@/lib/ai/gemini";
import { cn } from "@/lib/utils";

interface GeminiWorkspaceMessage extends GeminiChatMessage {
  id: string;
}

interface GeminiWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenDiagram?: () => void;
}

const SUGGESTED_PROMPTS = [
  "Summarize the key points from our latest brainstorm.",
  "Draft a checklist we can drop onto the whiteboard.",
  "Suggest a few themes for the upcoming workshop.",
];

export const GeminiWorkspace = ({
  open,
  onOpenChange,
  onOpenDiagram,
  onOpenSettings,
}: GeminiWorkspaceProps) => {
  const { toast } = useToast();
  const { hasApiKey, sendMessage } = useGeminiChat();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<GeminiWorkspaceMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, open]);

  const conversation = useMemo<GeminiChatMessage[]>(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const handleOpenSettings = () => {
    onOpenChange(false);
    onOpenSettings?.();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      toast({
        title: "Add a prompt",
        description: "Tell Gemini what you need before sending.",
      });
      return;
    }

    const userMessage: GeminiWorkspaceMessage = {
      id: nanoid(),
      role: "user",
      content: trimmed,
    };

    const nextConversation = [...conversation, { role: "user", content: trimmed }];

    setMessages((previous) => [...previous, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const reply = await sendMessage({ messages: nextConversation });
      const assistantMessage: GeminiWorkspaceMessage = {
        id: nanoid(),
        role: "assistant",
        content: reply,
      };
      setMessages((previous) => [...previous, assistantMessage]);
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.id !== userMessage.id));
      setInput(trimmed);

      if (error instanceof GeminiMissingKeyError) {
        toast({
          title: "Add your Gemini key",
          description: "Paste a valid Gemini API key to start chatting.",
          action: (
            <Button variant="outline" onClick={handleOpenSettings}>
              Open settings
            </Button>
          ),
        });
        return;
      }

      if (error instanceof GeminiResponseError) {
        toast({
          title: "Gemini response issue",
          description: error.message,
        });
        return;
      }

      toast({
        title: "Gemini request failed",
        description: error instanceof Error ? error.message : "Unexpected error calling Gemini.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResetConversation = () => {
    setMessages([]);
    setInput("");
  };

  const handleUsePrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <div className="border-b bg-background/80 p-6">
          <SheetHeader className="items-start text-left">
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-2">
                <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="h-5 w-5 text-primary" /> Gemini workspace
                </SheetTitle>
                <SheetDescription>
                  Chat with Gemini to ideate, summarize, and drop structured results onto the canvas.
                </SheetDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onOpenDiagram?.()}
                >
                  <Workflow className="h-4 w-4" /> Generate diagram
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleOpenSettings}
                >
                  <Settings2 className="h-4 w-4" /> Settings
                </Button>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="flex h-full flex-1 flex-col gap-4 p-6">
          {hasApiKey ? (
            <>
              <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-4">
                {messages.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
                    <div className="rounded-full bg-background p-3 shadow-sm">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <p className="max-w-sm">
                      Ask Gemini for next steps, synthesize sticky notes, or request assets that we can send to the
                      canvas.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTED_PROMPTS.map((prompt) => (
                        <Button
                          key={prompt}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUsePrompt(prompt)}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex w-full flex-col gap-1",
                          message.role === "user" ? "items-end" : "items-start",
                        )}
                      >
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {message.role === "assistant" ? "Gemini" : "You"}
                        </span>
                        <div
                          className={cn(
                            "max-w-full whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm leading-relaxed shadow-sm sm:max-w-[85%]",
                            message.role === "assistant"
                              ? "bg-background/80"
                              : "bg-primary text-primary-foreground",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div ref={scrollAnchorRef} />
              </ScrollArea>

              <form className="space-y-3" onSubmit={handleSubmit}>
                <Textarea
                  placeholder="Ask Gemini for support and we'll keep the conversation here."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isSending}
                  rows={4}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 self-start"
                    onClick={handleResetConversation}
                    disabled={messages.length === 0 || isSending}
                  >
                    <Undo2 className="h-4 w-4" /> Clear conversation
                  </Button>
                  <div className="flex items-center gap-2 self-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => onOpenDiagram?.()}
                    >
                      <Workflow className="h-4 w-4" /> Diagram ideas
                    </Button>
                    <Button type="submit" disabled={isSending || input.trim().length === 0} className="gap-2">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {isSending ? "Thinking" : "Send"}
                    </Button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-muted p-3 shadow-sm">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Unlock Gemini tools</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Add your Gemini API key to chat, draft artifacts, and convert ideas into diagrams without leaving the
                  canvas.
                </p>
              </div>
              <Button onClick={handleOpenSettings}>Open Gemini settings</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

