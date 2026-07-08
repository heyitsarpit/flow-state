import type { FlowStoryDocDescriptor } from "../inspect.js";

import type { FlowCliStoryRegistryEntry } from "./story-registry.js";

export type FlowCliStoryReadEntry = FlowCliStoryRegistryEntry;

export type FlowCliStorySeedDescriptor = Readonly<{
  label: string;
  fixtures: ReadonlyArray<string>;
  resourceCount: number;
  hasBoot: boolean;
  actorId?: string;
}>;

export type FlowCliStoryListEnvelope = Readonly<{
  kind: "story-list";
  stories: ReadonlyArray<
    Readonly<{
      id: string;
      machineId: string;
      title: string;
      description?: string;
      start: string;
      expectedState?: string;
      tags: ReadonlyArray<string>;
      seed?: FlowCliStorySeedDescriptor;
    }>
  >;
}>;

export type FlowCliStoryDescribeEnvelope = Readonly<{
  kind: "story-describe";
  machineId: string;
  story: FlowStoryDocDescriptor;
}>;

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function storySeedJson(entry: FlowCliStoryReadEntry) {
  if (entry.doc.seed === undefined) {
    return undefined;
  }

  return Object.freeze({
    label: entry.doc.seed.label,
    fixtures: entry.doc.seed.fixtures,
    resourceCount: entry.doc.seed.resourceCount,
    hasBoot: entry.doc.seed.hasBoot,
    ...(entry.doc.seed.actorId === undefined ? {} : { actorId: entry.doc.seed.actorId }),
  });
}

export function formatStoryListText(entries: ReadonlyArray<FlowCliStoryReadEntry>): string {
  const lines = ["# Stories"];

  if (entries.length === 0) {
    lines.push("", "- No stories matched the current filters.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const detailParts = [`start=${entry.doc.start.kind}`];

    if (entry.story.expectedState !== undefined) {
      detailParts.push(`expectedState=${entry.story.expectedState}`);
    }

    if (entry.doc.tags.length > 0) {
      detailParts.push(`tags=${entry.doc.tags.join(",")}`);
    }

    if (entry.doc.seed !== undefined) {
      detailParts.push(`seed=${entry.doc.seed.label}`);
    }

    lines.push(
      "",
      `- ${entry.story.id} [${entry.machineId}] ${entry.story.title}`,
      `  ${detailParts.join(" | ")}`,
    );
  }

  return lines.join("\n");
}

export function formatStoryDescribeText(entry: FlowCliStoryReadEntry): string {
  const lines = [
    `# Story: ${entry.story.id}`,
    `Machine: ${entry.machineId}`,
    `Title: ${entry.story.title}`,
  ];

  if (entry.story.description !== undefined) {
    lines.push(`Description: ${entry.story.description}`);
  }

  lines.push(`Start: ${entry.doc.start.label}`);

  if (entry.doc.seed !== undefined) {
    lines.push(`Seed: ${entry.doc.seed.label}`);
  }

  lines.push(`Tags: ${formatList(entry.doc.tags)}`);
  lines.push("Events:");

  if (entry.doc.events.length === 0) {
    lines.push("- none");
  } else {
    for (const event of entry.doc.events) {
      lines.push(`- ${event.label}`);
    }
  }

  lines.push("Expectations:");
  if (entry.doc.expectations.length === 0) {
    lines.push("- none");
  } else {
    for (const expectation of entry.doc.expectations) {
      lines.push(`- ${expectation.label}`);
    }
  }

  return lines.join("\n");
}

export function storyListJson(
  entries: ReadonlyArray<FlowCliStoryReadEntry>,
): FlowCliStoryListEnvelope {
  return Object.freeze({
    kind: "story-list" as const,
    stories: Object.freeze(
      entries.map((entry) => {
        const seed = storySeedJson(entry);

        return Object.freeze({
          id: entry.story.id,
          machineId: entry.machineId,
          title: entry.story.title,
          start: entry.doc.start.kind,
          tags: entry.doc.tags,
          ...(entry.story.description === undefined
            ? {}
            : { description: entry.story.description }),
          ...(entry.story.expectedState === undefined
            ? {}
            : { expectedState: entry.story.expectedState }),
          ...(seed === undefined ? {} : { seed }),
        });
      }),
    ),
  });
}

export function storyDescribeJson(entry: FlowCliStoryReadEntry): FlowCliStoryDescribeEnvelope {
  return Object.freeze({
    kind: "story-describe" as const,
    machineId: entry.machineId,
    story: entry.doc,
  });
}
