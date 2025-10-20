"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BrainCircuit,
  Loader2,
  Send,
  Settings2,
  Sparkles,
  Undo2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  GeminiMissingKeyError,
  GeminiResponseError,
  type GeminiChatMessage,
  useGeminiChat,
  useGeminiDiagram,
  type GeminiDiagramKind,
} from "@/lib/ai/gemini";
import { buildDiagramElements, insertDiagramElements } from "@/lib/ai/diagram-builder";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

interface GeminiWorkspaceMessage extends GeminiChatMessage {
  id: string;
}

interface GeminiWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}

const SUGGESTED_PROMPTS = [
  "Summarize the key points from our latest brainstorm.",
  "Draft a checklist we can drop onto the whiteboard.",
  "Suggest a few themes for the upcoming workshop.",
];

const DIAGRAM_OPTIONS: Array<{
  label: string;
  value: GeminiDiagramKind;
  description: string;
  icon: LucideIcon;
}> = [
  {
    label: "Mind Map",
    value: "mind-map",
    description: "Radiates key topics from a central idea.",
    icon: BrainCircuit,
  },
  {
    label: "Flowchart",
    value: "flowchart",
    description: "Outlines sequential steps and decisions.",
    icon: Workflow,
  },
];

export const GeminiWorkspace = ({ open, onOpenChange, onOpenSettings }: GeminiWorkspaceProps) => {
  const { toast } = useToast();
  const { hasApiKey, sendMessage } = useGeminiChat();
  const { hasApiKey: hasDiagramKey, generate } = useGeminiDiagram();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<GeminiWorkspaceMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [mode, setMode] = useState<"chat" | "diagram">("chat");
  const [diagramKind, setDiagramKind] = useState<GeminiDiagramKind>("mind-map");
  const [diagramPrompt, setDiagramPrompt] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const diagramMutation = useMutation({
    mutationFn: async ({ prompt, kind }: { prompt: string; kind: GeminiDiagramKind }) => {
      return generate({ prompt, kind });
    },
    onSuccess: (data, variables) => {
      const store = useWhiteboardStore.getState();
      const build = buildDiagramElements(data, variables.kind, {
        strokeColor: store.strokeColor,
        strokeOpacity: store.strokeOpacity,
        fillColor: store.fillColor,
        fillOpacity: store.fillOpacity,
        strokeWidth: store.strokeWidth,
        strokeStyle: store.strokeStyle,
        sloppiness: store.sloppiness,
        arrowType: store.arrowType,
        arrowStyle: store.arrowStyle,
        opacity: store.opacity,
        rectangleCornerStyle: store.rectangleCornerStyle,
        textFontFamily: store.textFontFamily,
        textFontSize: store.textFontSize,
        penBackground: store.penBackground,
        pan: store.pan,
        zoom: store.zoom,
      });

      if (build.elements.length === 0) {
        toast({
          variant: "destructive",
          title: "Nothing to add",
          description: "Gemini did not return any diagram nodes.",
        });
        return;
      }

      insertDiagramElements(build.elements, build.selectionIds);

      const summary = [
        `${build.nodeCount} node${build.nodeCount === 1 ? "" : "s"}`,
        `${build.edgeCount} connection${build.edgeCount === 1 ? "" : "s"}`,
      ];
      if (build.summaryLabels.length > 0) {
        summary.push(build.summaryLabels.join(" • "));
      }

      toast({
        title: variables.kind === "mind-map" ? "Mind map ready" : "Flowchart added",
        description: summary.join(" — "),
        action: (
          <ToastAction
            altText="Undo diagram"
            onClick={() => {
              useWhiteboardStore.getState().undo();
            }}
          >
            Undo
          </ToastAction>
        ),
      });

      setDiagramPrompt("");
      setMode("chat");
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      if (error instanceof GeminiMissingKeyError) {
        toast({
          variant: "destructive",
          title: "Add your Gemini API key",
          description: "Open settings to paste a key before generating diagrams.",
        });
        return;
      }

      if (error instanceof GeminiResponseError) {
        toast({
          variant: "destructive",
          title: "Gemini response issue",
          description: error.message,
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Gemini request failed",
        description: error instanceof Error ? error.message : "Unexpected error calling Gemini.",
      });
    },
  });

  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) {
      setMode("chat");
      setDiagramPrompt("");
      diagramMutation.reset();
    }
  }, [open, diagramMutation]);

  const conversation = useMemo<GeminiChatMessage[]>(
    () =>
      messages.map<GeminiChatMessage>(({ role, content }) => ({
        role,
        content,
      })),
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

    const nextConversation: GeminiChatMessage[] = [
      ...conversation,
      { role: "user", content: trimmed } satisfies GeminiChatMessage,
    ];

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

  const isDiagramSubmitDisabled = useMemo(() => {
    if (!hasDiagramKey) {
      return true;
    }
    return diagramMutation.isPending || diagramPrompt.trim().length === 0;
  }, [diagramMutation.isPending, diagramPrompt, hasDiagramKey]);

  const handleDiagramSubmit = () => {
    const trimmed = diagramPrompt.trim();
    if (!trimmed) {
      toast({
        title: "Prompt required",
        description: "Tell Gemini what to sketch before generating a diagram.",
      });
      return;
    }

    diagramMutation.mutate({ prompt: trimmed, kind: diagramKind });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full flex-col gap-0 p-0 sm:max-w-xl">
        <div className="border-b bg-muted/40">
          <SheetHeader className="space-y-2 px-6 py-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="h-5 w-5 text-primary" /> Gemini workspace
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  Chat with Gemini or draft diagrams, then send the results straight to the canvas.
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border bg-background p-1 text-xs font-medium shadow-sm">
                  <Button
                    type="button"
                    variant={mode === "chat" ? "default" : "ghost"}
                    size="sm"
                    className={cn("h-8 rounded-full px-3", mode === "chat" ? "shadow-sm" : "")}
                    onClick={() => setMode("chat")}
                  >
                    Chat
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "diagram" ? "default" : "ghost"}
                    size="sm"
                    className={cn("h-8 rounded-full px-3", mode === "diagram" ? "shadow-sm" : "")}
                    onClick={() => setMode("diagram")}
                  >
                    Diagram
                  </Button>
                </div>
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
          {mode === "chat" ? (
            hasApiKey ? (
              <>
                <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-4">
                  {messages.length === 0 ? (
                    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
                      <div className="rounded-full bg-background p-3 shadow-sm">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <p className="max-w-sm">
                        Ask Gemini for next steps, synthesize sticky notes, or request assets that we can send to the canvas.
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
                        onClick={() => setMode("diagram")}
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
                    Add your Gemini API key to chat, draft artifacts, and convert ideas into diagrams without leaving the canvas.
                  </p>
                </div>
                <Button onClick={handleOpenSettings}>Open Gemini settings</Button>
              </div>
            )
          ) : hasDiagramKey ? (
            <div className="flex h-full flex-1 flex-col gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Diagram style</Label>
                <RadioGroup
                  value={diagramKind}
                  onValueChange={(value) => setDiagramKind(value as GeminiDiagramKind)}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {DIAGRAM_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isActive = diagramKind === option.value;
                    return (
                      <label
                        key={option.value}
                        htmlFor={`diagram-${option.value}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition hover:border-primary/50",
                          isActive ? "border-primary shadow-sm" : "border-border",
                        )}
                      >
                        <RadioGroupItem id={`diagram-${option.value}`} value={option.value} className="mt-1" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Icon className="h-4 w-4 text-primary" />
                            {option.label}
                          </div>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gemini-diagram-prompt">Prompt</Label>
                <Textarea
                  id="gemini-diagram-prompt"
                  placeholder={
                    diagramKind === "mind-map"
                      ? "Map the main ideas for launching a tea subscription service..."
                      : "Explain the onboarding flow for new workspace members..."
                  }
                  value={diagramPrompt}
                  onChange={(event) => setDiagramPrompt(event.target.value)}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Keep it short but specific—Gemini returns up to 12 nodes with labeled connections.
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button onClick={handleDiagramSubmit} disabled={isDiagramSubmitDisabled} className="gap-2">
                  {diagramMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate diagram
                    </>
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode("chat")}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-muted p-3 shadow-sm">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Unlock Gemini tools</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Add your Gemini API key to chat, draft artifacts, and convert ideas into diagrams without leaving the canvas.
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
