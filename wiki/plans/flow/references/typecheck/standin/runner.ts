// STAND-IN for the test runner's public API (Vitest's `test` and `expect`). The repo's types/vite-plus-test.d.ts exports `it` only.
export interface Matchers {
  readonly not: Matchers;
  readonly rejects: Matchers & Promise<void>;
  readonly resolves: Matchers & Promise<void>;
  toBe(expected: unknown): any;
  toEqual(expected: unknown): any;
  toMatchObject(expected: unknown): any;
  toContainEqual(expected: unknown): any;
  toContain(expected: unknown): any;
  toHaveLength(expected: number): any;
  toBeDefined(): any;
  toBeUndefined(): any;
  toBeNull(): any;
  toBeTruthy(): any;
  toBeFalsy(): any;
  toBeGreaterThan(expected: number): any;
  toBeGreaterThanOrEqual(expected: number): any;
  toBeLessThan(expected: number): any;
  toBeLessThanOrEqual(expected: number): any;
  toHaveProperty(key: string, value?: unknown): any;
  toThrow(expected?: unknown): any;
  toBeInTheDocument(): any;
}
export declare const expect: ((actual: unknown) => Matchers) & {
  objectContaining: (value: unknown) => any;
  arrayContaining: (value: ReadonlyArray<unknown>) => any;
  stringContaining: (value: string) => any;
  anything: () => any;
  any: (type: unknown) => any;
};
type Body = () => void | Promise<unknown>;
export declare const test: ((name: string, body: Body, timeout?: number) => void) & {
  readonly todo: (name: string) => void;
};
export declare const it: typeof test;
export declare const describe: (name: string, body: () => void) => void;
