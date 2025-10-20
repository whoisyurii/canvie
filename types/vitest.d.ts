type VitestMock = {
  mockImplementation: (...args: unknown[]) => VitestMock;
};

declare module "vitest" {
  export const vi: {
    fn: (...args: unknown[]) => VitestMock;
    spyOn: (...args: unknown[]) => VitestMock;
    resetAllMocks: () => void;
    clearAllMocks: () => void;
    restoreAllMocks: () => void;
  };

  export const describe: (...args: unknown[]) => void;
  export const it: (...args: unknown[]) => void;
  export const beforeEach: (...args: unknown[]) => void;
  export const expect: (...args: unknown[]) => unknown;
}
