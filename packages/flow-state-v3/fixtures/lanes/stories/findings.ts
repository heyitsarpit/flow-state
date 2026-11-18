import { Fake } from "../../../src/host/testing/index.ts";
import { serializeClient } from "../app.ts";
import { lanesStory } from "./usual.ts";

/**
 * A lane record of the serialize client with no head that still says it is in flight and holds a
 * queued commit, as a damaged disk could leave it: a lane with no head has neither, so no release
 * writes one.
 */
export const headlessQueued = {
  key: 'lane/Lanes/serialize/serialize-1|sync|{"repo":"flow"}',
  text: '{"attempt":null,"displaced":[],"format":3,"inFlight":true,"input":null,"machine":"Lanes/serialize","name":"serialize-1","operation":"sync","queue":[{"repo":"flow"}],"retryCount":0}',
} as const;

/**
 * The serialize client starts; then the store holds a lane record with no head that claims a
 * queued commit in flight, and the tab reloads and ensures the client: neither is read, so no
 * commit ends and the boot wakes no one for it. Until lane records stop reading them it breaks a
 * run rule, so it is a builder its test runs; the manifest registers it once it passes.
 */
export const headlessLaneQueued = () =>
  lanesStory("lanes/headless-lane-queued")
    .ensure(serializeClient)
    .world(Fake.storage.put(headlessQueued.key, headlessQueued.text))
    .reload({ reattach: false })
    .checkpoint("booted")
    .ensure(serializeClient)
    .checkpoint("restored");
