declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args?: ReadonlyArray<string>,
    options?: Readonly<{
      readonly cwd?: string;
      readonly encoding?: string;
      readonly stdio?: string;
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

declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: Readonly<{
      readonly recursive?: boolean;
    }>,
  ): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
  export function rm(
    path: string,
    options?: Readonly<{
      readonly force?: boolean;
      readonly recursive?: boolean;
    }>,
  ): Promise<void>;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: ReadonlyArray<string>): string;
  export function resolve(...parts: ReadonlyArray<string>): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): Readonly<{ href: string }>;
}

declare const process: {
  readonly argv: readonly string[];
  readonly execPath: string;
  readonly stderr: Readonly<{
    write(message: string): void;
  }>;
  readonly stdout: Readonly<{
    write(message: string): void;
  }>;
  readonly cwd: () => string;
  exitCode?: number;
};
