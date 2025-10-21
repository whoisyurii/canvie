import { type ReactNode } from "react";
import { CheckIcon } from "lucide-react";

import type { CanvasBackground } from "@/lib/store/useWhiteboardStore";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface CanvasContextMenuProps {
  children: ReactNode;
  canvasBackground: CanvasBackground;
  onBackgroundChange: (background: CanvasBackground) => void;
  clipboardReadSupported: boolean;
  clipboardWriteSupported: boolean;
  onPaste: () => void | Promise<void>;
  onCopyAsPng: () => void | Promise<void>;
  onCopyAsSvg: () => void | Promise<void>;
  onSelectAll: () => void;
  disableZIndexActions: boolean;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
}

export const CanvasContextMenu = ({
  children,
  canvasBackground,
  onBackgroundChange,
  clipboardReadSupported,
  clipboardWriteSupported,
  onPaste,
  onCopyAsPng,
  onCopyAsSvg,
  onSelectAll,
  disableZIndexActions,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
}: CanvasContextMenuProps) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            onBackgroundChange("none");
          }}
        >
          No grid
          {canvasBackground === "none" ? (
            <CheckIcon aria-hidden className="ml-auto size-4" />
          ) : null}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onBackgroundChange("simple");
          }}
        >
          Simple grid
          {canvasBackground === "simple" ? (
            <CheckIcon aria-hidden className="ml-auto size-4" />
          ) : null}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onBackgroundChange("technical");
          }}
        >
          Technical grid
          {canvasBackground === "technical" ? (
            <CheckIcon aria-hidden className="ml-auto size-4" />
          ) : null}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!clipboardReadSupported}
          onSelect={() => {
            void onPaste();
          }}
        >
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={disableZIndexActions}
          onSelect={() => {
            onBringToFront();
          }}
        >
          Bring to Front
          <ContextMenuShortcut>Ctrl+Shift+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disableZIndexActions}
          onSelect={() => {
            onBringForward();
          }}
        >
          Bring Forward
          <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disableZIndexActions}
          onSelect={() => {
            onSendBackward();
          }}
        >
          Send Backward
          <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disableZIndexActions}
          onSelect={() => {
            onSendToBack();
          }}
        >
          Send to Back
          <ContextMenuShortcut>Ctrl+Shift+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!clipboardWriteSupported}
          onSelect={() => {
            void onCopyAsPng();
          }}
        >
          Copy to clipboard as PNG
          <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!clipboardWriteSupported}
          onSelect={() => {
            void onCopyAsSvg();
          }}
        >
          Copy to clipboard as SVG
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            onSelectAll();
          }}
        >
          Select all
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
