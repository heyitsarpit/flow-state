# Goals [What the project is trying to become]

## Primary Goal

Design Flow State as an Effect-native frontend runtime where users model screens and workflows as explicit state machines, and all external work is performed through typed Effect programs.

## Design Goals

- Make illegal UI states hard to represent.
- Make expected failures typed and visible.
- Make state transitions explicit enough for humans and AI agents to edit safely.
- Make async work attach to state boundaries.
- Make caching and invalidation feel like part of workflow design, not a separate scattered concern.
- Make tests a first-class part of the API design.
- Keep the first implementation slice small enough to validate through examples.

## Documentation Goals

- Keep planning files procedural and easy for future agents to execute.
- Let Vocs become the implementation guide for runtime semantics, API surfaces, package boundaries, test strategy, and quality gates.
- Keep API reference pages lightweight: function, input, output, properties, description, implementation status, and open questions.
- Avoid full TypeScript declarations in docs until examples prove the types.
- Use Vocs as the long-term docs app.

## Example Goals

- Build examples before committing to internals.
- Start with one high-quality Project Editor example.
- Add examples of increasing complexity only after the first example exposes useful API pressure.
- Use tests in each example to reveal whether the API is pleasant, typed, and debuggable.

## Research Goals

- Understand enough of XState internals to copy or reimplement the useful algorithms in Effect-native terms.
- Understand cache and invalidation semantics well enough to design the resource/mutation layer.
- Evaluate whether fine-grained reactivity libraries are useful internally.

## Non-Goals For Now

- No production runtime implementation yet.
- No XState wrapper as the final runtime architecture.
- No full TanStack Query clone.
- No public atom/store product surface.
- No devtools implementation yet.
- No SSR plan yet.
- No Vue or Solid adapter yet.
- No visual editor yet.
- No final package naming decision yet.
- No final API freeze yet.
