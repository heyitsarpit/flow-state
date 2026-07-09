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
  const lines = [`story.list — ${entries.length} ${entries.length === 1 ? "story" : "stories"}`];

  if (entries.length === 0) {
    lines.push("result: none");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const detailParts: Array<string> = [];

    if (entry.story.expectedState !== undefined) {
      detailParts.push(`target=${entry.story.expectedState}`);
    }

    if (entry.doc.tags.length > 0) {
      detailParts.push(`tags=${entry.doc.tags.join(",")}`);
    }

    lines.push(
      `${entry.story.id}  machine=${entry.machineId}${detailParts.length === 0 ? "" : `  ${detailParts.join("  ")}`}`,
    );
  }

  return lines.join("\n");
}

export function formatStoryDescribeText(entry: FlowCliStoryReadEntry): string {
  const lines = [`story.describe ${entry.story.id}`, `machine: ${entry.machineId}`];

  if (entry.story.description !== undefined) {
    lines.push(`purpose: ${entry.story.description}`);
  }

  lines.push(`start: ${entry.doc.start.kind}`);

  if (entry.doc.seed !== undefined) {
    lines.push(`seed: ${entry.doc.seed.label}`);
  }

  if (entry.doc.tags.length > 0) lines.push(`tags: ${entry.doc.tags.join(", ")}`);
  lines.push("events:");

  if (entry.doc.events.length === 0) {
    lines.push("  none");
  } else {
    for (const event of entry.doc.events) {
      lines.push(`  - ${event.label.replace(/^Send /, "")}`);
    }
  }

  lines.push("expect:");
  if (entry.doc.expectations.length === 0) {
    lines.push("  none");
  } else {
    for (const expectation of entry.doc.expectations) {
      lines.push(`  - ${expectation.label}`);
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
