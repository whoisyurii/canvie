export const TEXT_MIN_WIDTH = 160;
export const TEXT_MAX_WIDTH = 2000; // Increased to allow very long single lines
export const TEXT_BASE_PADDING = 24;

export const FONT_FALLBACKS: Record<string, string> = {
  Inter: "Inter, sans-serif",
  "DM Sans": '"DM Sans", sans-serif',
  "Roboto Mono": '"Roboto Mono", monospace',
  "Open Sans": '"Open Sans", sans-serif',
  Montserrat: '"Montserrat", sans-serif',
  "Comic Sans MS": '"Comic Sans MS", "Comic Sans", cursive',
  "Lucida Handwriting": '"Lucida Handwriting", "Lucida", cursive',
  "Playfair Display": '"Playfair Display", serif',
  "Source Code Pro": '"Source Code Pro", monospace',
  "Fira Code": '"Fira Code", monospace',
};

export const getFontFamilyCss = (fontFamily?: string) => {
  if (!fontFamily) return FONT_FALLBACKS.Inter;
  return FONT_FALLBACKS[fontFamily] ?? fontFamily;
};

export const getLineHeight = (fontSize: number) => Math.round(fontSize * 1.4);

export const estimateTextBoxWidth = (text: string, fontSize: number) => {
  const lines = (text ?? "").split(/\r?\n/);
  const longestLineLength = lines.reduce(
    (max, line) => Math.max(max, line.length),
    0
  );
  const approxCharWidth = fontSize * 0.6;
  const widthFromContent = Math.max(
    TEXT_MIN_WIDTH,
    longestLineLength * approxCharWidth + TEXT_BASE_PADDING
  );
  // No max width limit - allow infinite horizontal expansion
  return widthFromContent || TEXT_MIN_WIDTH;
};

export const estimateTextBoxHeight = (text: string, fontSize: number) => {
  const lineCount = Math.max(1, (text ?? "").split(/\r?\n/).length);
  const lineHeight = getLineHeight(fontSize);
  return Math.max(
    lineCount * lineHeight + TEXT_BASE_PADDING / 2,
    lineHeight + TEXT_BASE_PADDING / 2
  );
};
