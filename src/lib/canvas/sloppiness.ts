import type { Sloppiness } from "@/lib/store/useWhiteboardStore";

export type SloppyStrokeLayer = {
  points: number[];
  strokeWidth: number;
  opacity: number;
};

const hashString = (input: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let value = seed || 1;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createRandom = (seed: string) => mulberry32(hashString(seed));

const getPolylineLength = (points: number[], closed: boolean) => {
  if (!points || points.length < 4) {
    return 0;
  }

  let length = 0;
  const pointCount = Math.floor(points.length / 2);
  const segmentCount = closed ? pointCount : pointCount - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const startIndex = index * 2;
    const endIndex = ((index + 1) % pointCount) * 2;
    const x1 = points[startIndex] ?? 0;
    const y1 = points[startIndex + 1] ?? 0;
    const x2 = points[endIndex] ?? 0;
    const y2 = points[endIndex + 1] ?? 0;
    length += Math.hypot(x2 - x1, y2 - y1);
  }

  return length;
};

export const createSloppyStrokeLayers = (
  points: number[] | undefined,
  {
    sloppiness,
    strokeWidth,
    seed,
    closed = false,
  }: {
    sloppiness: Sloppiness | undefined;
    strokeWidth: number;
    seed: string;
    closed?: boolean;
  },
): SloppyStrokeLayer[] => {
  if (!points || points.length < 4) {
    return [];
  }

  const mode = sloppiness ?? "smooth";
  if (mode === "smooth") {
    return [];
  }

  const baseLength = getPolylineLength(points, closed);
  if (baseLength <= 0) {
    return [];
  }

  const intensity = 0.45;
  const config =
    mode === "rough"
      ? { layers: 2, amplitude: 2.8 * intensity, spacing: 28 }
      : { layers: 1, amplitude: 1.35 * intensity, spacing: 32 };

  const lengthScale = Math.max(0.65, Math.min(1.55, baseLength / 220 + 0.55));
  const layers: SloppyStrokeLayer[] = [];

  for (let layerIndex = 0; layerIndex < config.layers; layerIndex += 1) {
    const random = createRandom(`${seed}:${layerIndex}`);
    const layerAmplitude =
      (config.amplitude + strokeWidth * (mode === "rough" ? 0.55 : 0.35)) *
      lengthScale *
      (1 + layerIndex * 0.35);
    const spacing = config.spacing / lengthScale;

    const jittered: number[] = [];
    const pointCount = Math.floor(points.length / 2);
    const segmentCount = closed ? pointCount : pointCount - 1;

    if (segmentCount <= 0) {
      continue;
    }

    const baseOffsetX = (random() - 0.5) * layerAmplitude * 0.4;
    const baseOffsetY = (random() - 0.5) * layerAmplitude * 0.4;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const startIndex = segment * 2;
      const endIndex = ((segment + 1) % pointCount) * 2;

      const startX = points[startIndex] ?? 0;
      const startY = points[startIndex + 1] ?? 0;
      const endX = points[endIndex] ?? 0;
      const endY = points[endIndex + 1] ?? 0;

      const dx = endX - startX;
      const dy = endY - startY;
      const segmentLength = Math.hypot(dx, dy) || 1;
      const normalX = -dy / segmentLength;
      const normalY = dx / segmentLength;
      const tangentX = dx / segmentLength;
      const tangentY = dy / segmentLength;

      const steps = Math.max(1, Math.round(segmentLength / spacing));

      for (let step = 0; step <= steps; step += 1) {
        if (!closed && segment === 0 && step === 0) {
          jittered.push(startX, startY);
          continue;
        }

        if (!closed && segment === segmentCount - 1 && step === steps) {
          jittered.push(endX, endY);
          continue;
        }

        if (closed && segment === segmentCount - 1 && step === steps) {
          continue;
        }

        const t = step / steps;
        const baseX = startX + dx * t;
        const baseY = startY + dy * t;

        const offsetMagnitude = (random() - 0.5) * 1.6 * layerAmplitude;
        const tangentOffset = (random() - 0.5) * 1.6 * layerAmplitude * 0.2;

        const offsetX = normalX * offsetMagnitude + tangentX * tangentOffset + baseOffsetX;
        const offsetY = normalY * offsetMagnitude + tangentY * tangentOffset + baseOffsetY;

        const jitteredX = baseX + offsetX;
        const jitteredY = baseY + offsetY;
        jittered.push(jitteredX, jitteredY);
      }
    }

    const widthVariance =
      strokeWidth * (mode === "rough" ? 0.18 : 0.1) * intensity;
    const strokeFactor = 0.9 + random() * 0.2;
    const stroke = Math.max(0.4, strokeWidth * strokeFactor + (random() - 0.5) * widthVariance);
    const opacity = Math.max(0.6, Math.min(0.9, 0.86 - layerIndex * 0.1 + (random() - 0.5) * 0.08));

    layers.push({ points: jittered, strokeWidth: stroke, opacity });
  }

  return layers;
};

export const getRectangleOutlinePoints = (
  width = 0,
  height = 0,
  cornerRadius = 0,
) => {
  const absWidth = Math.abs(width);
  const absHeight = Math.abs(height);
  const radiusLimit = Math.min(absWidth, absHeight) / 2;
  const radius = Math.min(Math.abs(cornerRadius), radiusLimit);

  const points: number[] = [];

  const pushPoint = (x: number, y: number) => {
    const actualX = width >= 0 ? x : width + x;
    const actualY = height >= 0 ? y : height + y;
    points.push(actualX, actualY);
  };

  if (radius <= 0) {
    pushPoint(0, 0);
    pushPoint(absWidth, 0);
    pushPoint(absWidth, absHeight);
    pushPoint(0, absHeight);
    return points;
  }

  const segmentsPerCorner = Math.max(2, Math.round(radius / 6));

  const addArcPoints = (
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
  ) => {
    const start = (startAngle * Math.PI) / 180;
    const end = (endAngle * Math.PI) / 180;
    const total = end - start;
    for (let step = 1; step <= segmentsPerCorner; step += 1) {
      const t = step / segmentsPerCorner;
      const angle = start + total * t;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      pushPoint(x, y);
    }
  };

  pushPoint(radius, 0);
  pushPoint(absWidth - radius, 0);
  addArcPoints(absWidth - radius, radius, -90, 0);
  pushPoint(absWidth, radius);
  pushPoint(absWidth, absHeight - radius);
  addArcPoints(absWidth - radius, absHeight - radius, 0, 90);
  pushPoint(absWidth - radius, absHeight);
  pushPoint(radius, absHeight);
  addArcPoints(radius, absHeight - radius, 90, 180);
  pushPoint(0, absHeight - radius);
  pushPoint(0, radius);
  addArcPoints(radius, radius, 180, 270);

  return points;
};

export const getEllipseOutlinePoints = (width = 0, height = 0, segments = 40) => {
  const radiusX = Math.max(1, Math.abs(width) / 2);
  const radiusY = Math.max(1, Math.abs(height) / 2);
  const points: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    points.push(x, y);
  }
  return points;
};

export const sampleCurvePoints = (points: number[] | undefined, samples = 24) => {
  if (!points || points.length < 4) {
    return [];
  }

  if (points.length === 4) {
    return points.slice();
  }

  const [
    startX = 0,
    startY = 0,
    control1X = 0,
    control1Y = 0,
    control2X = control1X,
    control2Y = control1Y,
    endX = 0,
    endY = 0,
  ] = points;

  const result: number[] = [];
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const mt = 1 - t;
    const x =
      mt * mt * mt * startX +
      3 * mt * mt * t * control1X +
      3 * mt * t * t * control2X +
      t * t * t * endX;
    const y =
      mt * mt * mt * startY +
      3 * mt * mt * t * control1Y +
      3 * mt * t * t * control2Y +
      t * t * t * endY;
    result.push(x, y);
  }
  return result;
};
