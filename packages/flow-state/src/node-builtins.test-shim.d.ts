declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args?: ReadonlyArray<string>,
    options?: Readonly<{
      readonly encoding?: string;
    }>,
  ): string;
}

declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...parts: ReadonlyArray<string>): string;
}

declare const process: Readonly<{
  readonly execPath: string;
}>;
