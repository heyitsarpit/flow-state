---
name: api-design
description: Design, review, document, and evolve APIs using Joshua Bloch's API design maxims. Use when shaping public APIs, libraries, module boundaries, names, types, mutability, inheritance, failure behavior, documentation, examples, or compatibility.
---

# How to Design a Good API and Why it Matters

Use this skill when designing or reviewing an API. Follow the workflow in order, and treat each maxim as a check against the current design. Keep the requirements, use-cases, draft API, client examples, implementation, documentation, and tests aligned as the API evolves.

## Procedure

### 1. Frame the API around users and use-cases

Start by identifying the boundary, the people who will use it, and the problems it must solve.

**All programmers are API designers.** Good programs are modular, and intermodular boundaries define APIs. Good modules get reused.

**When designing an API, first gather requirements—with a healthy degree of skepticism.** People often provide solutions; it’s your job to ferret out the underlying problems and find the best solutions.

**Structure requirements as _use-cases_:** they are the yardstick against which you’ll measure your API.

**Expect API-design mistakes due to failures of imagination.** You can’t reasonably hope to imagine everything that everyone will do with an API, or how it will interact with every other part of a system.

**API design is not a solitary activity.** Show your design to as many people as you can, and take their feedback seriously. Possibilities that elude your imagination may be clear to others.

**You can’t please everyone so aim to displease everyone equally.** Most APIs are overconstrained.

### 2. Draft the smallest useful surface and test it early

Write the API before committing to its implementation, then use realistic client code to expose a broken shape while it is still cheap to change.

**Early drafts of APIs should be short, typically one page** with class and method signatures and one-line descriptions. This makes it easy to restructure the API when you don’t get it right the first time.

**Code the use-cases against your API before you implement it,** even before you specify it properly. This will save you from implementing, or even specifying, a fundamentally broken API.

**Maintain the code for uses-cases as the API evolves.** Not only will this protect you from rude surprises, but the resulting code will become the examples for the API, the basis for tutorials and tests.

**APIs can be among your greatest assets or liabilities.** Good APIs create long-term customers; bad ones create long-term support nightmares.

**Public APIs, like diamonds, are forever.** You have one chance to get it right so give it your best.

**When in doubt, leave it out.** If there is a fundamental theorem of API design, this is it. It applies equally to functionality, classes, methods, and parameters. Every facet of an API should be as small as possible, but no smaller. **You can always add things later, but you can’t take them away.**

**Minimizing conceptual weight is more important than class- or method-count.**

### 3. Make ordinary use easy and the surface unsurprising

Prefer names, types, defaults, accessibility, and behavior that let clients express common operations directly and make misuse difficult to write.

**APIs should be easy to use and hard to misuse.** It should be easy to do simple things; possible to do complex things; and impossible, or at least difficult, to do wrong things.

**APIs should be self-documenting.** It should rarely require documentation to read code written to a good API. In fact, it should rarely require documentation to _write_ it.

**If it’s hard to find good names, go back to the drawing board.** Don’t be afraid to split or merge an API, or embed it in a more general setting. If names start falling into place, you’re on the right track.

**Names matter.** Strive for intelligibility, consistency, and symmetry. Every API is a little language, and people must learn to read and write it. **If you get an API right, code will read like prose.**

**Use the right data type for the job.** For example, don’t use string if there is a more appropriate type.

**Use consistent parameter ordering across methods.** Otherwise, programmers will get it backwards.

**Avoid long parameter lists,** especially those with multiple consecutive parameters of the same type.

**Overload with care.** If the behaviors of two methods differ, it’s better to give them different names.

**Minimize accessibility; when in doubt, make it private.** This simplifies APIs and reduces coupling.

**APIs must coexist peacefully with the platform, so do what is customary.** It is almost always wrong to “transliterate” an API from one platform to another.

**Keep APIs free of implementations details.** They confuse users and inhibit the flexibility to evolve. It isn’t always obvious what’s an implementation detail: **Be wary of overspecification.**

**Avoid fixed limits on input sizes.** They limit usefulness and hasten obsolescence.

**Obey the principle of least astonishment.** Every method should do the least surprising thing it could, given its name. If a method doesn’t do what users think it will, bugs will result.

**Don’t make the client do anything the library could do.** Violating this rule leads to boilerplate code in the client, which is annoying and error-prone.

### 4. Choose data, mutability, inheritance, and failure semantics deliberately

Make the object model and error behavior explicit, keep the client’s normal path simple, and expose the data needed for programmatic use.

**Minimize mutability.** Immutable objects are simple, thread-safe, and freely sharable.

**Subclass only if you can say with a straight face that every instance of the subclass is an instance of the superclass.** Exposed classes should never subclass just to reuse implementation code.

**Design and document for inheritance or else prohibit it.** This documentation takes the form of _self-use patterns_: how methods in a class use one another. Without it, safe subclassing is impossible.

**Provide programmatic access to all data available in string form.** Otherwise, programmers will be forced to parse strings, which is painful. Worse, the string forms will turn into de facto APIs.

**Avoid return values that demand exceptional processing.** Clients will forget to write the special-case code, leading to bugs. For example, return zero-length arrays or collections rather than nulls.

**Throw exceptions only to indicate exceptional conditions.** Otherwise, clients will be forced to use exceptions for normal flow control, leading to programs that are hard to read, buggy, or slow.

**Throw unchecked exceptions unless clients can realistically recover from the failure.**

**Fail fast.** The sooner you report a bug, the less damage it will do. Compile-time is best. If you must fail at run-time, do it as soon as possible.

### 5. Verify the result through examples, documentation, and trade-offs

Use the resulting examples and documentation as part of the design, account for performance without distorting the API, and apply the heuristics with judgment.

**Example code should be exemplary.** If an API is used widely, its examples will be the archetypes for thousands of programs. Any mistakes will come back to haunt you a thousand fold.

**Documentation matters.** No matter how good an API, it won’t get used without good documentation. Document every exported API element: every class, method, field, and parameter.

**Consider the performance consequences of API design decisions,** but don’t warp an API to achieve performance gains. Luckily, good APIs typically lend themselves to fast implementations.

**API design is an art, not a science.** Strive for beauty, and trust your gut. Do not adhere slavishly to the above heuristics, but violate them only infrequently and with good reason.

## Additional API design checks

The following additions come from Jasmin Blanchette, _The Little Manual of API Design_, Trolltech, a Nokia company, June 19, 2008. Apply them alongside the preceding maxims without replacing or reinterpreting them.

### Evolve and publish APIs deliberately

**Define a complete direction.** An API should let users do the work they need, and when complete coverage is impractical, it should provide clear extension or customization points.

**Study an existing API before replacing it.** Learn its behavior and the good ideas users depend on, avoid gratuitous changes, and preserve a compatible superset where possible so migration does not exchange old flaws for new ones.

**Review internal APIs before publishing them.** Internal names and signatures may become permanent the moment external code depends on them, so subject them to the same design review as explicitly public APIs.

### Choose useful defaults

**Choose useful defaults.** Let common operations work with little boilerplate, make Boolean options false by default when that expresses the natural opt-in behavior, and document every default that affects semantics.

### Treat edge cases as part of the contract

**Design and test edge cases deliberately.** Start with the general case, then verify empty, boundary, and unusual inputs; make sure the underlying abstractions handle them coherently and use unit tests to keep those semantics stable across releases.

### Separate public APIs from virtual APIs

**Separate direct-use methods from subclass hooks and exercise extensibility before committing to it.** Keep the public API stable while exposing a smaller, documented virtual API for customization, document how the class uses its own methods so subclasses can override it safely, and work through at least three realistic subclasses or subclass examples before publication.

### Prefer property-based APIs when construction gets crowded

**Use properties when an object has many independent attributes.** Let clients construct a usable object with sensible defaults and set properties in any order, which removes positional-parameter mistakes, keeps call sites readable, and makes later extension easier.

## Source attribution

**Author attribution:** Joshua Bloch, Google Inc., Mountain View, California, USA. Contact listed in the paper: jjb@google.com.

**Source:** Invited Talk, OOPSLA’06, October 22–26, 2006, Portland, Oregon, USA. ACM 1-59593-491-X/06/0010, pp. 506–507.

**Copyright:** Copyright is held by the author/owner(s).

In lieu of a traditional abstract, I’ve tried to distill the essence of the talk into a collection of maxims:

**Categories & Subject Descriptors:** D.2.13 Reusable Software

**General Terms:** Design, Documentation, Performance.