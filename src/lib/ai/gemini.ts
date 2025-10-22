"use client";

import { useCallback } from "react";
import { z } from "zod";

import { useAiSettings } from "@/hooks/useAiSettings";

const optionalTrimmedString = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalInteger = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    const numeric = typeof value === "string" ? Number.parseInt(value, 10) : value;
    return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
  });

type TemplateKindValue = "mind-map" | "flowchart";

const normalizeTemplateKind = (value?: string | null): TemplateKindValue | undefined => {
  const trimmed = optionalTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "-");
  if (normalized === "mind-map" || normalized === "mindmap") {
    return "mind-map";
  }
  if (normalized === "flowchart" || normalized === "flow-chart") {
    return "flowchart";
  }

  return undefined;
};

export const diagramNodeSchema = z.object({
  id: z.string().min(1, "Node id is required"),
  label: z.string().min(1, "Node label is required"),
  type: z.string().min(1, "Node type is required"),
  role: z
    .string()
    .optional()
    .transform((value) => optionalTrimmedString(value)),
  templateRole: z
    .string()
    .optional()
    .transform((value) => optionalTrimmedString(value)),
  quadrant: z
    .string()
    .optional()
    .transform((value) => optionalTrimmedString(value)),
  lane: z
    .string()
    .optional()
    .transform((value) => optionalTrimmedString(value)),
  level: optionalInteger,
  order: optionalInteger,
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

const diagramTemplateSchema = z
  .object({
    id: z.string().min(1, "Template id is required"),
    label: z.string().optional(),
    kind: z.string().optional(),
  })
  .transform((value) => ({
    id: value.id.trim(),
    label: optionalTrimmedString(value.label),
    kind: normalizeTemplateKind(value.kind),
  }));

export const diagramResponseSchema = z.object({
  template: diagramTemplateSchema.optional(),
  nodes: z.array(diagramNodeSchema).min(1, "At least one node must be returned"),
  edges: z.array(diagramEdgeSchema).default([]),
});

export type GeminiDiagramResponse = z.infer<typeof diagramResponseSchema>;
export type GeminiDiagramKind = TemplateKindValue;

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
  templateId?: string;
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

const callGeminiDiagram = async ({ apiKey, model, prompt, kind, templateId }: GeminiDiagramRequest) => {
  const targetDescription = kind === "flowchart" ? "flowchart" : "mind map";
  const templateInstruction =
    templateId && templateId.length > 0
      ? ` Use the template "${templateId}" when planning the response and echo it under template.id.`
      : " When you infer a template, include its identifier in template.id and add a concise template.label.";
  const systemInstruction =
    `You are a diagram planner. Always respond with strictly valid JSON describing a ${targetDescription}.` +
    " The payload must match this schema: {\n" +
    '  "template"?: { id: string; label?: string; kind?: "mind-map" | "flowchart" },\n' +
    '  "nodes": Array<{ id: string; label: string; type: string; role?: string; level?: number; order?: number; quadrant?: string; lane?: string }>,\n' +
    '  "edges": Array<{ from: string; to: string; kind: string }>\n' +
    "}.\n" +
    "Nodes should be concise (max 8 words per label)." +
    " For flowcharts, use type values like start, process, decision, end. For mind maps, explicitly note template roles such as central, primary, quadrant, or timeline milestone." +
    " Use at most 12 nodes." +
    " Always include template.id and add template.label when it helps clarify the layout." +
    templateInstruction;

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
    async ({
      prompt,
      kind,
      templateId,
    }: {
      prompt: string;
      kind: GeminiDiagramKind;
      templateId?: string;
    }) => {
      if (!geminiApiKey) {
        throw new GeminiMissingKeyError();
      }

      return callGeminiDiagram({
        apiKey: geminiApiKey,
        model: preferredModel,
        prompt,
        kind,
        templateId,
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
