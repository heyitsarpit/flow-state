import { Option } from "effect";
import type { Unreadable } from "../port.ts";
import type { World } from "../world/world.ts";
import type { CaseOptions } from "./case.ts";
import { Fact } from "./oracle.ts";

/**
 * The Runtime one case drives across its boots: the current one, booting again over the same world
 * after a kill, and the first report the adapter could not read.
 *
 * **Details**
 *
 * - `reboot` kills the page (its timers, tasks, held batches and calls die), records `Reloaded`
 *   and boots the port again at the current release.
 * - `upgrade` sets the release the next boot runs, as a deploy between two page loads does.
 */
export const runtimeLife = (options: CaseOptions, world: World, record: (fact: Fact) => void) => {
  const fixtures = options.fixtures.map((f) => f.name);
  const unread: Array<Unreadable> = [];
  let release = 1;

  const boot = () =>
    options.port.boot({
      fixtures,
      captureMs: 0,
      sessionSeed: world.hosts.page.sessionSeed(),
      release,
      hosts: world.hosts,
      observe: (observation) => record(Fact.Reported({ observation })),
      unreadable: (failure) => void unread.push(failure),
      disposed: (exit) => record(Fact.Disposal({ exit })),
    });

  let runtime = boot();

  return {
    runtime: () => runtime,
    pending: () => runtime.pending(),
    unread: () => Option.fromUndefinedOr(unread[0]),
    upgrade: (to: number) => {
      release = to;
    },
    reboot: () => {
      world.kill();
      record(Fact.Reloaded());
      runtime = boot();

      return runtime;
    },
  };
};
