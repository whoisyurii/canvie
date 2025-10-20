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

type GeminiCandidatePart = { text?: string };
type GeminiCandidate = {
  content?: {
    parts?: GeminiCandidatePart[];
  };
};

type GeminiSuccessResponse = {
  candidates?: GeminiCandidate[];
};

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

const requestGemini = async ({
  apiKey,
  model,
  payload,
}: {
  apiKey: string;
  model: string;
  payload: unknown;
}) => {
  const url = `${API_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
      type GeminiErrorPayload = {
        error?: {
          message?: string;
        };
      };

      const errorPayload = (await response.json()) as GeminiErrorPayload;
      if (errorPayload.error?.message) {
        message = errorPayload.error.message;
      }
    } catch (error) {
      // ignore parse failures
    }
    throw new GeminiError(message);
  }

  return (await response.json()) as GeminiSuccessResponse;
};

const collectCandidateText = (data: GeminiSuccessResponse): string[] => {
  const firstCandidate = data?.candidates?.[0];
  return Array.isArray(firstCandidate?.content?.parts)
    ? firstCandidate.content.parts
        .map((part: GeminiCandidatePart) => part?.text)
        .filter((value: string | undefined): value is string => Boolean(value))
    : [];
};

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

export type GeminiChatRole = "user" | "assistant";

export interface GeminiChatMessage {
  role: GeminiChatRole;
  content: string;
}

interface GeminiChatRequest {
  apiKey: string;
  model: string;
  messages: GeminiChatMessage[];
  systemInstruction?: string;
}

const toModelRole = (role: GeminiChatRole) => (role === "assistant" ? "model" : "user");

const callGeminiDiagram = async ({ apiKey, model, prompt, kind }: GeminiDiagramRequest) => {
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

  const data = await requestGemini({ apiKey, model, payload });
  const candidateParts = collectCandidateText(data);

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

const callGeminiChat = async ({ apiKey, model, messages, systemInstruction }: GeminiChatRequest) => {
  if (!messages || messages.length === 0) {
    throw new GeminiResponseError("Provide at least one message before calling Gemini.");
  }

  const payload: Record<string, unknown> = {
    contents: messages.map((message) => ({
      role: toModelRole(message.role),
      parts: [
        {
          text: message.content,
        },
      ],
    })),
    generationConfig: {
      responseMimeType: "text/plain",
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      role: "system",
      parts: [
        {
          text: systemInstruction,
        },
      ],
    };
  }

  const data = await requestGemini({ apiKey, model, payload });
  const candidateParts = collectCandidateText(data);

  if (candidateParts.length === 0) {
    throw new GeminiResponseError("Gemini returned no content.");
  }

  return candidateParts.join("\n").trim();
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

export const useGeminiChat = () => {
  const { geminiApiKey, preferredModel } = useAiSettings();

  const sendMessage = useCallback(
    async ({
      messages,
      systemInstruction,
    }: {
      messages: GeminiChatMessage[];
      systemInstruction?: string;
    }) => {
      if (!geminiApiKey) {
        throw new GeminiMissingKeyError();
      }

      return callGeminiChat({
        apiKey: geminiApiKey,
        model: preferredModel,
        messages,
        systemInstruction,
      });
    },
    [geminiApiKey, preferredModel],
  );

  return {
    hasApiKey: Boolean(geminiApiKey),
    geminiApiKey,
    preferredModel,
    sendMessage,
  };
};
