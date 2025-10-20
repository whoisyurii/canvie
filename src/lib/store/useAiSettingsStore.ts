"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";
export type AiOutputMode = "inline" | "sticky-note" | "sidebar";

export interface AiSettingsState {
  geminiApiKey: string;
  preferredModel: GeminiModel;
  defaultOutputMode: AiOutputMode;
  setGeminiApiKey: (apiKey: string) => void;
  clearGeminiApiKey: () => void;
  setPreferredModel: (model: GeminiModel) => void;
  setDefaultOutputMode: (mode: AiOutputMode) => void;
  reset: () => void;
}

const DEFAULT_MODEL: GeminiModel = "gemini-2.5-flash";
const DEFAULT_OUTPUT_MODE: AiOutputMode = "inline";

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      geminiApiKey: "",
      preferredModel: DEFAULT_MODEL,
      defaultOutputMode: DEFAULT_OUTPUT_MODE,
      setGeminiApiKey: (apiKey) => set({ geminiApiKey: apiKey.trim() }),
      clearGeminiApiKey: () => set({ geminiApiKey: "" }),
      setPreferredModel: (model) => set({ preferredModel: model }),
      setDefaultOutputMode: (mode) => set({ defaultOutputMode: mode }),
      reset: () =>
        set({
          geminiApiKey: "",
          preferredModel: DEFAULT_MODEL,
          defaultOutputMode: DEFAULT_OUTPUT_MODE,
        }),
    }),
    {
      name: "realitea-ai-settings",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        geminiApiKey: state.geminiApiKey,
        preferredModel: state.preferredModel,
        defaultOutputMode: state.defaultOutputMode,
      }),
    },
  ),
);
