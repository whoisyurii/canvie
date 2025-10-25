/**
 * Shared constants and utilities for canvas rendering.
 */
export const PEN_TENSION = 0.75;

export const STROKE_BACKGROUND_PADDING = 12;

/**
 * Calculates a safe corner radius value to prevent negative radius errors.
 * The radius is clamped to be at most half of the smallest dimension.
 */
export const getSafeCornerRadius = (
  width: number | undefined,
  height: number | undefined,
  cornerRadius: number | undefined
): number => {
  if (!cornerRadius || cornerRadius <= 0) return 0;

  const w = Math.abs(width ?? 0);
  const h = Math.abs(height ?? 0);

  if (w <= 0 || h <= 0) return 0;

  const maxRadius = Math.min(w, h) / 2;
  return Math.max(0, Math.min(Math.abs(cornerRadius), maxRadius));
};
