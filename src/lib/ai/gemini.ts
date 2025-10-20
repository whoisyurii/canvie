"use client";

import { useCallback } from "react";
import { z } from "zod";

import { useAiSettings } from "@/hooks/useAiSettings";

export const diagramNodeSchema = z.object({
  id: z.string().min(1, "Node id is required"),
  label: z.string().min(1, "Node label is required"),
  type: z.string().min(1, "Node type is required"),
});

export const diagramEdgeSchema = z.object({
  from: z.string().min(1, "Edge origin is required"),
  to: z.string().min(1, "Edge target is required"),
  kind: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : "relationship";
    }),
});

export const diagramResponseSchema = z.object({
  nodes: z.array(diagramNodeSchema).min(1, "At least one node must be returned"),
  edges: z.array(diagramEdgeSchema).default([]),
});

export type GeminiDiagramResponse = z.infer<typeof diagramResponseSchema>;
export type GeminiDiagramKind = "mind-map" | "flowchart";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

export class GeminiMissingKeyError extends GeminiError {
  constructor() {
    super("Add a Gemini API key before generating diagrams.");
    this.name = "GeminiMissingKeyError";
  }
}

export class GeminiResponseError extends GeminiError {
  constructor(message = "Gemini returned an unexpected response.") {
    super(message);
    this.name = "GeminiResponseError";
  }
}

const extractJsonPayload = (text: string) => {
  if (!text) {
    return "";
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
};

interface GeminiDiagramRequest {
  apiKey: string;
  model: string;
  prompt: string;
  kind: GeminiDiagramKind;
}

const callGeminiDiagram = async ({ apiKey, model, prompt, kind }: GeminiDiagramRequest) => {
  const url = `${API_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const targetDescription = kind === "flowchart" ? "flowchart" : "mind map";
  const systemInstruction =
    `You are a diagram planner. Always respond with strictly valid JSON describing a ${targetDescription}.` +
    " The payload must match this schema: {\n" +
    '  "nodes": Array<{ id: string; label: string; type: string }>,\n' +
    '  "edges": Array<{ from: string; to: string; kind: string }>\n' +
    "}.\n" +
    "Nodes should be concise (max 8 words per label)." +
    " For flowcharts, use type values like start, process, decision, end. For mind maps, use central, branch, detail, etc." +
    " Use at most 12 nodes.";

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemInstruction}\n\nUser request:\n${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Gemini request failed (${response.status})`;
    try {
      const errorPayload = await response.json();
      if (errorPayload?.error?.message) {
        message = errorPayload.error.message as string;
      }
    } catch (error) {
      // ignore parse failures
    }
    throw new GeminiError(message);
  }

  const data = await response.json();
  const firstCandidate = data?.candidates?.[0];
  const candidateParts: Array<string> = Array.isArray(firstCandidate?.content?.parts)
    ? firstCandidate.content.parts
        .map((part: { text?: string }) => part?.text)
        .filter((value: string | undefined): value is string => Boolean(value))
    : [];

  if (candidateParts.length === 0) {
    throw new GeminiResponseError("Gemini returned no content.");
  }

  const raw = extractJsonPayload(candidateParts.join("\n"));
  if (!raw) {
    throw new GeminiResponseError("Gemini response did not include JSON content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GeminiResponseError("Gemini response was not valid JSON.");
  }

  try {
    return diagramResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new GeminiResponseError(error.issues.map((issue) => issue.message).join("; "));
    }
    throw error;
  }
};

export const useGeminiDiagram = () => {
  const { geminiApiKey, preferredModel } = useAiSettings();

  const generate = useCallback(
    async ({ prompt, kind }: { prompt: string; kind: GeminiDiagramKind }) => {
      if (!geminiApiKey) {
        throw new GeminiMissingKeyError();
      }

      return callGeminiDiagram({
        apiKey: geminiApiKey,
        model: preferredModel,
        prompt,
        kind,
      });
    },
    [geminiApiKey, preferredModel],
  );

  return {
    hasApiKey: Boolean(geminiApiKey),
    geminiApiKey,
    preferredModel,
    generate,
  };
};
