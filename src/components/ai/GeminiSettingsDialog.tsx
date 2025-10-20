"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AiOutputMode, GeminiModel, useAiSettingsStore } from "@/lib/store/useAiSettingsStore";

const MODEL_OPTIONS: Array<{ label: string; value: GeminiModel; helper: string }> = [
  {
    label: "Gemini 2.5 Flash",
    value: "gemini-2.5-flash",
    helper: "Fast, cost-effective for live ideation.",
  },
  {
    label: "Gemini 2.5 Pro",
    value: "gemini-2.5-pro",
    helper: "Higher quality, better for detailed plans.",
  },
];

const OUTPUT_OPTIONS: Array<{ label: string; value: AiOutputMode; helper: string }> = [
  {
    label: "Inline canvas notes",
    value: "inline",
    helper: "Drops content directly where you're working.",
  },
  {
    label: "Sticky note",
    value: "sticky-note",
    helper: "Captures responses on a movable sticky.",
  },
  {
    label: "Sidebar summary",
    value: "sidebar",
    helper: "Keeps longer outputs tucked away for reference.",
  },
];

export interface GeminiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GeminiSettingsDialog = ({ open, onOpenChange }: GeminiSettingsDialogProps) => {
  const { toast } = useToast();
  const {
    geminiApiKey,
    preferredModel,
    defaultOutputMode,
    setGeminiApiKey,
    setPreferredModel,
    setDefaultOutputMode,
    clearGeminiApiKey,
  } = useAiSettingsStore();

  const [localKey, setLocalKey] = useState(geminiApiKey);
  const [localModel, setLocalModel] = useState<GeminiModel>(preferredModel);
  const [localOutputMode, setLocalOutputMode] = useState<AiOutputMode>(defaultOutputMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalKey(geminiApiKey);
      setLocalModel(preferredModel);
      setLocalOutputMode(defaultOutputMode);
    }
  }, [open, geminiApiKey, preferredModel, defaultOutputMode]);

  const isDirty = useMemo(
    () =>
      localKey !== geminiApiKey ||
      localModel !== preferredModel ||
      localOutputMode !== defaultOutputMode,
    [defaultOutputMode, geminiApiKey, localKey, localModel, localOutputMode, preferredModel],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const trimmedKey = localKey.trim();
      if (!trimmedKey) {
        toast({
          title: "API key required",
          description: "Paste a valid Gemini API key before saving.",
        });
        return;
      }

      setGeminiApiKey(trimmedKey);
      setPreferredModel(localModel);
      setDefaultOutputMode(localOutputMode);

      toast({
        title: "Gemini ready",
        description: "Your preferences are stored locally in this browser.",
      });

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearKey = () => {
    clearGeminiApiKey();
    setLocalKey("");
    toast({
      title: "Key removed",
      description: "Gemini features are disabled until you add a new key.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Gemini workspace settings
          </DialogTitle>
          <DialogDescription>
            Grab an API key from
            {" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline"
            >
              Google AI Studio
            </a>
            . The key never leaves your browser—it's stored via localStorage and only used when you call
            Gemini tools from this device.
          </DialogDescription>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Generate a Gemini API key in Google AI Studio (it only takes a moment).</li>
            <li>Paste the key below to unlock Gemini-powered actions in Realitea Canvas.</li>
            <li>
              Choose your default model & output style; we remember them in this browser's localStorage.
            </li>
          </ol>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="gemini-api-key">Gemini API key</Label>
            <Input
              id="gemini-api-key"
              type="password"
              autoComplete="off"
              value={localKey}
              onChange={(event) => setLocalKey(event.target.value)}
              placeholder="Paste your key"
            />
            <p className="text-xs text-muted-foreground">
              We mask the key, but you can always replace it. Clearing the key disables Gemini features.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Preferred Gemini model</Label>
              <Select
                value={localModel}
                onValueChange={(value: GeminiModel) => setLocalModel(value)}
              >
                <SelectTrigger className="h-11 border-muted bg-muted/60 text-foreground shadow-inner">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="border-muted bg-card text-card-foreground">
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="flex-col items-start gap-1 space-y-1 py-2"
                    >
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.helper}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default output mode</Label>
              <Select
                value={localOutputMode}
                onValueChange={(value: AiOutputMode) => setLocalOutputMode(value)}
              >
                <SelectTrigger className="h-11 border-muted bg-muted/60 text-foreground shadow-inner">
                  <SelectValue placeholder="Choose an output style" />
                </SelectTrigger>
                <SelectContent className="border-muted bg-card text-card-foreground">
                  {OUTPUT_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="flex-col items-start gap-1 space-y-1 py-2"
                    >
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.helper}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-muted p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <p>
              Your Gemini settings sync to this browser only. Sharing a workspace won't expose your key to
              collaborators.
            </p>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:border-muted"
              onClick={handleClearKey}
              disabled={!geminiApiKey}
            >
              Remove key
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? "Saving..." : geminiApiKey ? "Save changes" : "Enable Gemini"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
