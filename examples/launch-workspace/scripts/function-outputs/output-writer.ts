import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type OutputArea = "inventory" | "behavior" | "testing" | "inspect";

export type ManifestEntry = Readonly<{
  area: OutputArea;
  functionName: string;
  outputPath: string;
  format: "json" | "txt";
  note: string;
}>;

export type OutputWriter = Readonly<{
  writeJson: (
    relativePath: string,
    value: unknown,
    area: OutputArea,
    functionName: string,
    note: string,
  ) => Promise<void>;
  writeText: (
    relativePath: string,
    value: string,
    area: OutputArea,
    functionName: string,
    note: string,
  ) => Promise<void>;
  writeManifest: () => Promise<void>;
}>;

export async function createOutputWriter(outputRoot: string): Promise<OutputWriter> {
  const manifest: Array<ManifestEntry> = [];
  await mkdir(outputRoot, { recursive: true });

  const write = async (
    relativePath: string,
    value: string,
    entry: Omit<ManifestEntry, "outputPath">,
  ) => {
    const target = resolve(outputRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${value}\n`, "utf8");
    manifest.push({
      ...entry,
      outputPath: relativePath,
    });
  };

  return Object.freeze({
    writeJson: (relativePath, value, area, functionName, note) =>
      write(relativePath, JSON.stringify(value, null, 2), {
        area,
        functionName,
        format: "json",
        note,
      }),
    writeText: (relativePath, value, area, functionName, note) =>
      write(relativePath, value, {
        area,
        functionName,
        format: "txt",
        note,
      }),
    writeManifest: () =>
      write("manifest.json", JSON.stringify(manifest, null, 2), {
        area: "behavior",
        functionName: "manifest",
        format: "json",
        note: "Function-to-output index.",
      }),
  });
}
