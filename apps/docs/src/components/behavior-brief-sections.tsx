type FlowBehaviorContract = Readonly<{
  version: string;
  app: Readonly<{
    id: string;
    moduleIds: ReadonlyArray<string>;
  }>;
  modules: ReadonlyArray<
    Readonly<{
      id: string;
      dependencies: ReadonlyArray<string>;
      screenIds: ReadonlyArray<string>;
      tagIds: ReadonlyArray<string>;
      fixtureIds: ReadonlyArray<string>;
    }>
  >;
  resources: ReadonlyArray<
    Readonly<{
      id: string;
      moduleId: string | null;
      hasSchema: boolean;
      hasPlaceholder: boolean;
      freshness: null | Readonly<{
        staleAfter: string | number;
        onInvalidate: "active" | "lazy" | "never" | null;
      }>;
    }>
  >;
  transactions: ReadonlyArray<
    Readonly<{
      id: string;
      hasPreview: boolean;
      hasQueueWhen: boolean;
      concurrency: string | null;
    }>
  >;
  machines: ReadonlyArray<
    Readonly<{
      id: string;
      initialStateId: string;
      states: ReadonlyArray<
        Readonly<{
          id: string;
          childIds: ReadonlyArray<string>;
          timedTransitions: ReadonlyArray<
            Readonly<{
              id: string;
            }>
          >;
          eventlessTransitions: ReadonlyArray<
            Readonly<{
              target: string;
            }>
          >;
        }>
      >;
      transitions: ReadonlyArray<
        Readonly<{
          source: string;
          target: string;
          eventType: string;
        }>
      >;
    }>
  >;
  streams: ReadonlyArray<
    Readonly<{
      id: string;
      pressure: null | Readonly<{
        strategy: "queue" | "coalesce-latest";
        limit: number | null;
      }>;
      routeKinds: ReadonlyArray<string>;
    }>
  >;
  views: ReadonlyArray<
    Readonly<{
      id: string;
      sources: ReadonlyArray<string>;
    }>
  >;
  stories: ReadonlyArray<
    Readonly<{
      id: string;
      title: string;
      start: "default" | "snapshot" | "setup";
    }>
  >;
}>;

type BehaviorBriefSectionsProps = Readonly<{
  contract: FlowBehaviorContract;
}>;

function uniqueOrdered(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const ordered: Array<string> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return ordered;
}

function commaList(values: ReadonlyArray<string>, empty = "none"): string {
  return values.length === 0 ? empty : values.join(", ");
}

function describeResource(resource: FlowBehaviorContract["resources"][number]): string {
  const facts = [
    resource.hasSchema ? "schema" : "no schema",
    resource.hasPlaceholder ? "placeholder" : "no placeholder",
    resource.freshness === null
      ? "no freshness policy"
      : `freshness ${String(resource.freshness.staleAfter)}; invalidate ${resource.freshness.onInvalidate ?? "default"}`,
  ];

  return `${resource.id} (${facts.join("; ")})`;
}

export function BehaviorBriefSections({ contract }: BehaviorBriefSectionsProps) {
  const screenIds = uniqueOrdered(contract.modules.flatMap((module) => module.screenIds));
  const fixtureIds = uniqueOrdered(contract.modules.flatMap((module) => module.fixtureIds));
  const setupStories = contract.stories.filter((story) => story.start === "setup").length;
  const resourceIds = contract.resources.map((resource) => describeResource(resource));

  return (
    <>
      <section>
        <h2 id="behavior-app">App</h2>
        <ul>
          <li>
            App id: <code data-v>{contract.app.id}</code>
          </li>
          <li>
            Modules: <code data-v>{commaList(contract.app.moduleIds)}</code>
          </li>
          <li>
            Fixtures: <code data-v>{commaList(fixtureIds)}</code>
          </li>
          <li>
            Resources: <code data-v>{commaList(resourceIds)}</code>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="behavior-modules">Modules</h2>
        <ul>
          {contract.modules.map((module) => {
            const moduleResources = contract.resources
              .filter((resource) => resource.moduleId === module.id)
              .map((resource) => describeResource(resource));

            return (
              <li key={module.id}>
                <code data-v>{module.id}</code>: dependencies {commaList(module.dependencies)};
                fixtures {commaList(module.fixtureIds)}; resources {commaList(moduleResources)}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 id="behavior-screens">Screens</h2>
        <p>
          <code data-v>{commaList(screenIds)}</code>
        </p>
      </section>

      <section>
        <h2 id="behavior-machines">Machines</h2>
        {contract.machines.map((machine) => (
          <div key={machine.id}>
            <h3>{machine.id}</h3>
            <ul>
              <li>
                Initial state: <code data-v>{machine.initialStateId}</code>
              </li>
              <li>
                States: <code data-v>{commaList(machine.states.map((state) => state.id))}</code>
              </li>
              <li>
                Key transitions:{" "}
                <code data-v>
                  {commaList(
                    machine.transitions.map(
                      (transition) =>
                        `${transition.source} --${transition.eventType}--> ${transition.target}`,
                    ),
                  )}
                </code>
              </li>
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 id="behavior-runtime-work">Runtime Work By State</h2>
        {contract.machines.map((machine) =>
          machine.states.map((state) => (
            <div key={`${machine.id}/${state.id}`}>
              <h3>{`${machine.id}/${state.id}`}</h3>
              <ul>
                <li>
                  Children: <code data-v>{commaList(state.childIds)}</code>
                </li>
                <li>
                  Timed transitions:{" "}
                  <code data-v>
                    {commaList(state.timedTransitions.map((transition) => transition.id))}
                  </code>
                </li>
                <li>
                  Eventless transitions:{" "}
                  <code data-v>
                    {commaList(state.eventlessTransitions.map((transition) => transition.target))}
                  </code>
                </li>
              </ul>
            </div>
          )),
        )}
      </section>

      <section>
        <h2 id="behavior-writes-streams">Transactions And Streams</h2>
        <ul>
          {contract.transactions.map((transaction) => (
            <li key={transaction.id}>
              <code data-v>{transaction.id}</code>: preview {transaction.hasPreview ? "yes" : "no"};
              queue {transaction.hasQueueWhen ? "when" : "without when"}; concurrency{" "}
              {transaction.concurrency ?? "default"}
            </li>
          ))}
          {contract.streams.map((stream) => (
            <li key={stream.id}>
              <code data-v>{stream.id}</code>: pressure{" "}
              {stream.pressure === null
                ? "none"
                : stream.pressure.limit === null
                  ? stream.pressure.strategy
                  : `${stream.pressure.strategy} limit=${stream.pressure.limit}`}
              ; routes {commaList(stream.routeKinds)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 id="behavior-views">Views</h2>
        <ul>
          {contract.views.map((view) => (
            <li key={view.id}>
              <code data-v>{view.id}</code>: {commaList(view.sources)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 id="behavior-stories">Stories And Coverage</h2>
        <p>
          Stories: <code data-v>{contract.stories.length}</code>
        </p>
        <p>
          Derived coverage view arrives through{" "}
          <code data-v>behavior render --section coverage</code>; the canonical contract stays the
          only committed artifact.
        </p>
        <p>
          Setup-described stories: <code data-v>{setupStories}</code>. Mismatch lanes are not stored
          in the canonical contract.
        </p>
        <ul>
          {contract.stories.map((story) => (
            <li key={story.id}>
              <code data-v>{story.id}</code>: {story.title} ({story.start})
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 id="behavior-links">Links To Deeper Owner Docs</h2>
        <ul>
          <li>
            <a href="/guide/app-structure">App Structure</a>
          </li>
          <li>
            <a href="/guide/ownership-and-runtime-facts">Ownership And Runtime Facts</a>
          </li>
          <li>
            <a href="/reference/inspection">Inspection</a>
          </li>
          <li>
            <a href="/reference/testing">Testing</a>
          </li>
          <li>
            <a href="/reference/runtime">Runtime</a>
          </li>
        </ul>
      </section>
    </>
  );
}
