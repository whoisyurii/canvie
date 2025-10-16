import "konva/lib/Stage";

declare module "konva/lib/Stage" {
  interface Stage {
    toSVG(options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      pixelRatio?: number;
      fullImage?: boolean;
      imageSmoothingEnabled?: boolean;
      quality?: number;
    }): string;
  }
}
