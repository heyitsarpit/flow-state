declare module "vite-plus/test" {
  type TestBody = () => void | Promise<void>;
  type TestApi = (name: string, body: TestBody, timeout?: number) => void;

  interface AsyncMatchers {
    toBe(expected: unknown): Promise<void>;
    toEqual(expected: unknown): Promise<void>;
    toThrow(expected?: unknown): Promise<void>;
  }

  interface Matchers {
    readonly not: Matchers;
    readonly rejects: AsyncMatchers;
    readonly resolves: AsyncMatchers;
    toBe(expected: unknown): void;
    toBeDefined(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeNull(): void;
    toBeTypeOf(expected: string): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toContainEqual(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toHaveProperty(expected: string): void;
    toMatchObject(expected: unknown): void;
    toThrow(expected?: unknown): void;
  }

  interface ExpectApi {
    (actual: unknown): Matchers;
    any(expected: unknown): unknown;
    arrayContaining(expected: readonly unknown[]): unknown;
    objectContaining(expected: object): unknown;
  }

  export const describe: TestApi;
  export const expect: ExpectApi;
  export const it: TestApi;
}
