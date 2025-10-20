export const getColorWithOpacity = (color?: string, opacityValue?: number) => {
  if (!color || color === "transparent") {
    return "transparent";
  }

  const normalizedOpacity = Math.min(1, Math.max(0, opacityValue ?? 1));
  if (normalizedOpacity >= 1) {
    return color;
  }

  if (color.startsWith("rgba(")) {
    const components = color
      .slice(5, -1)
      .split(",")
      .map((part) => part.trim());
    if (components.length >= 3) {
      return `rgba(${components[0]}, ${components[1]}, ${components[2]}, ${normalizedOpacity})`;
    }
  }

  if (color.startsWith("rgb(")) {
    const components = color
      .slice(4, -1)
      .split(",")
      .map((part) => part.trim());
    if (components.length >= 3) {
      return `rgba(${components[0]}, ${components[1]}, ${components[2]}, ${normalizedOpacity})`;
    }
  }

  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (![r, g, b].some((component) => Number.isNaN(component))) {
        return `rgba(${r}, ${g}, ${b}, ${normalizedOpacity})`;
      }
    }
  }

  return color;
};
