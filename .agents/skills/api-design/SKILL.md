---
name: api-design
description: "Design, review, document, and evolve public or reusable APIs with Joshua Bloch's maxims. Use for API shape, names, types, mutability, inheritance, failure behavior, documentation, examples, and compatibility. Skip generic TypeScript style, exact library lookup, and runtime architecture."
---

# API design

Use this skill when the API surface or contract is the decision. It covers public
APIs, libraries, reusable modules, module boundaries, and internal APIs before
publication.

Keep requirements, use-cases, the draft API, client examples, implementation,
documentation, and tests aligned as the API evolves.

Keep the boundary clear:

- Use `$typescript-style-guide` for generic syntax, formatting, and TypeScript conventions.
- Use `$effect-api-documentation` for exact library exports and signatures.
- Use `$effect-systems-design` for services, lifetimes, concurrency, and runtime ownership.

## Apply the skill

Use the checks that fit the change. A useful order is:

1. Identify the underlying problem, users, and use-cases.
2. Draft the smallest surface and exercise it with realistic client code.
3. Check names, types, defaults, mutability, inheritance, and failure semantics.
4. Check edge cases, documentation, examples, performance, and compatibility.
5. Verify the affected behavior and surface at a level proportional to the change.

Do not treat this as fixed ceremony. Skip irrelevant checks and explain deliberate
exceptions. Show important designs to several people, take their feedback
seriously, and remember that API design is not a solitary activity.

## Users and use-cases

- All programmers are API designers. Modular boundaries define APIs, and good modules get reused.
- Gather requirements with skepticism. People often offer solutions; find the underlying problems first.
- Make use-cases the yardstick for the design.
- Expect failures of imagination. You cannot predict every use or interaction.
- Most APIs are overconstrained. You cannot please everyone; aim to displease everyone equally.

## Surface and ordinary use

- Draft the API before implementation. Early drafts should fit on about one page of signatures and one-line descriptions.
- Code realistic use-cases against the draft before implementation or full specification. Keep that client code as examples, tutorials, and test material as the API evolves.
- Treat an API as a long-term asset or liability: good APIs create long-term users, while bad ones create long-term support work. Public APIs are effectively permanent; give the first design serious scrutiny.
- When in doubt, leave it out. Make the surface as small as possible, but no smaller. Additions are easier than removals.
- Minimize conceptual weight, not merely class or method count.
- Make simple use easy, complex use possible, and misuse difficult or impossible.
- Make the API self-documenting. Good code should rarely need documentation to read or write.
- If names are hard to find, reconsider the split, merge, or surrounding abstraction. Good names often signal a sound shape.
- Choose names for intelligibility, consistency, and symmetry. The API is a language; client code should read like prose.
- Use the right data type. Do not use a string when a more suitable type exists.
- Keep parameter order consistent. Avoid long lists, especially consecutive parameters with the same type.
- Overload only when behavior is the same. Give different behavior different names.
- Minimize accessibility. Make members private when there is no reason to expose them.
- Follow the platform's customary patterns. Do not transliterate an API from another platform.
- Keep implementation details and overspecification out of the public contract.
- Avoid fixed input-size limits unless the contract truly requires one; limits reduce usefulness and hasten obsolescence.
- Follow least astonishment: each method should do the least surprising thing its name implies, or client bugs will result.
- Do library work in the library. Do not force clients to write annoying, error-prone boilerplate the library can provide.

## Data, mutability, inheritance, and failures

- Minimize mutability. Immutable values are simpler, thread-safe, and freely shareable.
- Subclass only when every subclass instance is genuinely an instance of the superclass. Do not subclass merely to reuse implementation code.
- Design and document for inheritance, or prohibit it. Document self-use patterns so subclasses can override safely.
- Expose programmatic access to every datum also available in string form. Do not make clients parse strings or turn string formats into de facto APIs.
- Avoid return values that require special processing. For example, return an empty array or collection rather than `null` when there are no items.
- Throw exceptions only for exceptional conditions. Do not use them for normal control flow; that makes programs hard to read, buggy, or slow.
- Prefer unchecked exceptions unless a client can realistically recover.
- Fail fast. Report defects as early as possible: compile time is best; otherwise fail as soon as possible at runtime.

## Evolution and extension

These checks add to Bloch's maxims. The additional guidance is attributed to Jasmin
Blanchette, _The Little Manual of API Design_, Trolltech, a Nokia company, June 19,
2008. It does not replace or reinterpret Bloch's maxims.

- Define a complete direction. Cover needed work or provide clear extension and customization points.
- Before replacing an API, study its behavior and the ideas users depend on. Avoid gratuitous changes and preserve a compatible superset where practical; migration should not exchange old flaws for new ones.
- Review internal APIs before publishing them. External dependence can make internal names and signatures permanent.
- Choose useful defaults. Keep common operations low-boilerplate; use `false` for Boolean options when that expresses natural opt-in behavior. Document every semantic default.
- Treat edge cases as contract. Start with the general case, then test empty, boundary, and unusual inputs. Keep the underlying abstractions coherent and use unit tests to keep semantics stable across releases.
- Separate direct-use methods from subclass hooks. Keep the public API stable, expose a smaller documented virtual API, and document self-use. Before publishing extensibility, work through at least three realistic subclasses or subclass examples.
- When an object has many independent attributes, prefer properties over a crowded constructor. Provide sensible defaults and let clients set properties in any order. This avoids positional-parameter mistakes, keeps call sites readable, and eases later extension:

  ```ts
  const request = new Request()
  request.url = url
  request.timeout = timeout
  ```

## Examples, documentation, and trade-offs

- Example code should be exemplary. Widely used examples become the archetypes for client code, and their mistakes multiply.
- Documentation is essential. Without it, even a good API will not get used. Document every exported API element: each class, method, field, and parameter.
- Consider performance consequences, but do not warp the API for them. Good APIs usually permit efficient implementations.
- API design is an art, not a science. Strive for beauty and trust judgment. Use the maxims as heuristics, not laws; violate them rarely and for a stated reason.

## Source attribution

Author attribution: Joshua Bloch, Google Inc., Mountain View, California, USA.
Contact listed in the paper: jjb@google.com.

Source: Invited Talk, OOPSLA'06, October 22–26, 2006, Portland, Oregon, USA.
ACM 1-59593-491-X/06/0010, pp. 506–507.

Copyright: Copyright is held by the author/owner(s).

In lieu of a traditional abstract, the source distills the essence of the talk
into a collection of maxims.

Categories & Subject Descriptors: D.2.13 Reusable Software

General Terms: Design, Documentation, Performance.
