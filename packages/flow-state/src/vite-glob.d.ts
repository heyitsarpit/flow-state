interface ImportMeta {
  glob<Module = unknown>(
    pattern: string,
    options?: Readonly<{
      readonly eager?: boolean;
      readonly import?: string;
      readonly query?: string;
    }>,
  ): Record<string, Module>;
}
