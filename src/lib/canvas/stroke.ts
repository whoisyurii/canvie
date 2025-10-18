export const getStrokeDash = (style: string) => {
  switch (style) {
    case "dashed":
      return [10, 5];
    case "dotted":
      return [2, 5];
    default:
      return [];
  }
};
