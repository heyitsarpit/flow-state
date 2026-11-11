// Round 13: the configuration's Stories, as `defineConfig({ stories })` would list them (2.10.1: ids unique across the configuration). Discovery refuses a
// duplicate id before anything runs.
import { deskStories } from "./desk.story.ts";
import { payStories } from "./pay.story.ts";
import type { Story } from "./story.ts";
import { threedsStories } from "./threeds.story.ts";

export const stories: readonly Story<string>[] = [...payStories, ...threedsStories, ...deskStories];
const ids = stories.map((s) => s.id);
const dup = ids.find((x, i) => ids.indexOf(x) !== i);
if (dup) throw new Error(`StoryDuplicateId: ${dup}`);
export const storyById = (id: string) => stories.find((s) => s.id === id);
