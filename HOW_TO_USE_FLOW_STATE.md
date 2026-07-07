# How To Use Flow State

This is not a docs page yet.

This file is a meta note about the usage model the library is trying to push,
so we can later turn it into a real docs page without losing the intent.

This is also not an implementation backlog. The concrete build tasks belong in
[TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md),
[INSPECT.md](/Users/arpit/Developer/flow-state/INSPECT.md), and related task
lists.

## Concrete behavior-contract build flow

For the concrete behavior-contract build flow, use
[BEHAVIOR_SYSTEM.md](/Users/arpit/Developer/flow-state/BEHAVIOR_SYSTEM.md),
[BEHAVIOR_CONTRACT.md](/Users/arpit/Developer/flow-state/BEHAVIOR_CONTRACT.md),
and the committed
[behavior-contract.json](/Users/arpit/Developer/flow-state/apps/docs/src/generated/behavior-contract.json)
artifact.

The minimal loop is:

- `flow-state behavior build`
- `flow-state behavior render`
- `flow-state behavior diff`

Scaffolds stay future, opt-in, and non-canonical.

This file stays the usage-model note. The task list and generated outputs own
the concrete build loop.

## Core Claim

Flow State should not be explained like "a handy utility library for React
apps."

It is much closer to a framework for building apps in a particular way.

That way assumes:

- the code will often be authored or heavily assisted by AI
- upfront verbosity is acceptable if it improves clarity and testability
- the app should be developed through a test-first or test-driven loop
- product logic should be made explicit as states, transitions, resources,
  transactions, streams, and views

The point is not ceremony for its own sake.

The point is to make the app legible enough that an AI can keep building it
correctly under pressure.

The ambition is a style of frontend development where the app stays as close to
"fully testable by default" as possible, instead of pushing the hard logic out
into implicit component code that only becomes testable later.

## Why The Name Fits

"Flow State" is a good name for the model because it points at both the human
goal and the technical one.

In plain English, flow state means being fully immersed in a task instead of
constantly fighting the tool, the structure, or hidden complexity.

In the library, the idea is similar:

- the app should be understandable while it is running
- behavior should be explicit instead of hidden in scattered callbacks
- state should be described as something moving through time, not as a sealed
  black box of values

That is why this should not be framed as a static store with some helper APIs
around it.

A monolithic store usually says:

- here is the state
- now go mutate it somehow
- now infer the behavior from the surrounding code

Flow State should say something different:

- here are the resources
- here are the transactions
- here are the states and transitions
- here is how time, ownership, and effects move through the system

The application is not described as inert information. It is described in
motion.

That is the deeper meaning of the name:

- not just state as stored data
- state as a living flow of work
- not just information
- behavior unfolding in a legible runtime model

## The Ideal Workflow

On a new project, the ideal loop is something like:

1. Define the domain modules and app structure.
2. Define resources, transactions, machines, streams, and views.
3. Write the state graph and transitions before filling in all procedures.
4. Write scenario tests immediately.
5. Let the AI fill in implementations inside a TDD loop.
6. Keep the UI thin so most correctness stays provable in the harness.

In other words:

- structure first
- tests second
- implementation third
- repeat until the app is complete

## What "AI-First" Means Here

AI-first does not mean "vibes-first" or "skip architecture."

It means:

- write explicit state and transition boundaries
- use verbose names and explicit descriptors when they improve machine legibility
- keep domain facts serializable and inspectable
- make runtime effects swappable through Layers and descriptors
- make test scenarios cheap to generate and rerun

This is exactly the opposite of the average implicit React app where:

- behavior is buried in components
- `useEffect` does too much
- network logic is scattered
- timers and async procedures are hidden
- testing happens late and mostly at the UI edge

## What We Want The Library To Encourage

## 1. Machines Describe The Workflow First

The machine should define:

- states
- events
- guards
- transitions
- high-level actions

At first, the machine does not need every low-level procedure implemented.

The important thing is that the shape of the workflow exists early enough to
write tests against it.

## 2. Tests Come Before Most Procedures

The AI should be able to:

- write the state graph
- write the scenario tests
- discover the missing procedures from failing tests
- fill them in one by one

That is the workflow we should optimize the library for.

## 3. Resources Hold Canonical Data

Canonical data should usually live in resources, not in machine context.

Machine context should mostly hold workflow state:

- form draft
- selected id
- approval step
- upload state
- current mode

This keeps:

- tests smaller
- views simpler
- rehydration cleaner
- AI-generated code more predictable

## 4. Transactions Make Writes Explicit

Writes should not be hidden in arbitrary callbacks.

They should live in explicit transaction definitions so the system can reason
about:

- preview
- rollback
- invalidation
- concurrency
- retry
- stale results

That makes both the runtime and the tests much smarter.

## 5. Streams And Timers Stay Declarative

Long-running or time-based behavior should be declared in the runtime model, not
hand-wired ad hoc in components.

That means:

- `flow.after(...)` for delayed transitions
- `flow.stream(...)` for streaming work
- `flow.child(...)` for owned subflows

This is what makes the app fully testable instead of "mostly testable except for
the hard parts."

## 6. Views Keep The UI Thin

The UI should ideally consume:

- resources
- actor snapshots
- views

The UI should not be the main place where workflow behavior is invented.

That is how we avoid today’s common React trap where the component tree becomes
the real state machine by accident.

## Why Upfront Verbosity Is Welcome

Normal library design often optimizes for short code at author time.

Flow State should optimize more for:

- clarity for the next edit
- clarity for tests
- clarity for AI continuation
- explicitness of domain behavior
- inspectability and replayability

That means some verbosity is a feature, not a bug, if it buys:

- better names
- more explicit state boundaries
- swappable services
- deterministic tests
- fewer hidden couplings

The rule should be:

Accept verbosity when it creates leverage.
Remove verbosity when it is only wrapper ceremony.

## What The Eventual Docs Page Should Say

The future docs page should probably be called something like:

- "How To Use Flow State"
- or "The Flow State Way"

It should explain:

- this is closer to a framework than a helper library
- the intended development loop is AI-first and test-first
- the runtime wants explicit states, effects, and resources
- frontend code should stay thin and testable
- the testing package is the main engine of day-to-day app development

It should also show a concrete loop:

1. define machine states and transitions
2. define resources and transactions
3. write scenario tests
4. fill in service layers
5. implement the screen against views and resources
6. keep iterating until everything is covered

## What We Should Not Say

We should not oversell this as:

- "just another state library"
- "just a nicer XState"
- "just a React data layer"

And we should not pretend that minimal syntax is the main value.

The value is that it encourages a style of app development where the whole
system stays:

- explicit
- inspectable
- testable
- serializable
- AI-continuable

## Product Direction Hidden Inside This

If this usage model is right, then the library should keep moving toward:

- stronger testing ergonomics
- stronger inspection
- stronger app/module ownership
- clearer runtime receipts
- clearer AI-facing docs and examples

That is the strategic reason these docs matter.
