import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeminiWorkspace } from "../GeminiWorkspace";

const generateMock = vi.fn();

vi.mock("@/lib/ai/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/gemini")>("@/lib/ai/gemini");
  return {
    ...actual,
    useGeminiChat: vi.fn(() => ({ hasApiKey: true, sendMessage: vi.fn() })),
    useGeminiDiagram: vi.fn(() => ({ hasApiKey: true, generate: generateMock })),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("GeminiWorkspace diagram submission", () => {
  beforeEach(() => {
    generateMock.mockRejectedValue(new Error("Gemini failed"));
  });

  afterEach(() => {
    generateMock.mockReset();
  });

  it("passes the inferred template id to Gemini requests", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <GeminiWorkspace open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^diagram$/i }));
    await user.click(screen.getByLabelText(/flowchart/i));

    const promptField = screen.getByLabelText("Prompt");
    await user.type(
      promptField,
      "Plan a swimlane flowchart showing marketing vs sales responsibilities.",
    );

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /swimlane flowchart/i })).toBeChecked(),
    );

    await user.click(screen.getByRole("button", { name: /generate diagram/i }));

    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: "swimlane" }),
      );
    });
  });
});

