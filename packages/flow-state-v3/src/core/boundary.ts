import {
  Effect,
  Exit,
  Option,
  Predicate,
  Result,
  Schema,
  SchemaAST,
  type SchemaIssue,
  SchemaParser,
} from "effect";
import { Canonical, CodecFailure, writeCanonical } from "./codec.ts";

type Ast = SchemaAST.AST;

// FLOW_STATE_ALLOW_UNKNOWN: a value crossing the boundary, checked here by its Schema's parser.
type Value = unknown;

type Parsed = Exit.Exit<Value, SchemaIssue.Issue>;

type Parse = (input: Value) => Parsed;

type Parser = (input: Value, options: SchemaAST.ParseOptions) => Parsed;

/**
 * Hole levels a walk takes on the call stack before it moves to its own: Effect's parser spends
 * about a dozen frames a level, and the shallowest host measured runs out past a thousand levels.
 */
const BUDGET = 64;

// The placeholder a hole answers while its value waits on the explicit stack; a level that read
// one is parsed again, so it never reaches a result.
const WAITING = { waiting: true };

const NO_OPTIONS: SchemaAST.ParseOptions = {};

// One hole's value: the AST it is parsed by and the value itself.
type Work = { readonly ast: Ast; readonly input: Value };

// One walk: its results by AST and value, the holes the current level could not read yet, and,
// on the call stack, how deep it stands and whether it met a hole past its budget.
class Walk {
  readonly results = new Map<Ast, Map<Value, Parsed>>();
  // Each transformation's outputs by input: a level parsed again reads the very values a
  // transformation made the first time (a parsed JSON string), so its holes find their results.
  readonly transformed = new Map<Value, Map<Value, Value>>();
  readonly waiting: Array<Work> = [];
  readonly budget: number;
  depth = 0;
  deep = false;

  constructor(budget: number) {
    this.budget = budget;
  }

  // Runs one level a hole deeper on the call stack.
  deeper(parse: () => Parsed) {
    this.depth += 1;
    const result = parse();
    this.depth -= 1;

    return result;
  }

  // A hole past the budget: on the call stack the walk is too deep; on its own stack the hole
  // waits.
  past(work: Work) {
    if (this.budget > 0) this.deep = true;
    else this.waiting.push(work);
  }
}

const resultOf = (walk: Walk, ast: Ast, input: Value) => walk.results.get(ast)?.get(input);

// Every AST a node's own parse reaches before the next hole.
const childrenOf = (ast: Ast) => {
  const links = (ast.encoding ?? []).map((link) => link.to);

  if (SchemaAST.isDeclaration(ast)) return [...links, ...ast.typeParameters];

  if (SchemaAST.isArrays(ast)) return [...links, ...ast.elements, ...ast.rest];

  if (SchemaAST.isObjects(ast))
    return [
      ...links,
      ...ast.propertySignatures.map((p) => p.type),
      ...ast.indexSignatures.flatMap((i) => [i.parameter, i.type]),
    ];

  if (SchemaAST.isUnion(ast)) return [...links, ...ast.types];

  return SchemaAST.isSuspend(ast) ? [...links, ast.thunk()] : links;
};

// Whether any AST a node reaches transforms its value: one that reaches none parses a value it
// returned to itself, so its result is also the result of its own output.
const transforms = (root: Ast) => {
  const seen = new Set<Ast>();
  const stack = [root];

  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    if (at.encoding !== undefined) return true;

    if (!seen.has(at)) {
      seen.add(at);
      stack.push(...childrenOf(at));
    }
  }

  return false;
};

// An AST's own rebuild over its children, which every composite node has: Effect's own toType
// and flip walk the tree with it.
const rebuildOf = (ast: Ast) =>
  Predicate.hasProperty(ast, "recur") && Predicate.isFunction(ast.recur)
    ? Option.some(
        // SAFETY: `recur` is every composite AST node's own rebuild, typed internal in Effect.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Effect types its node rebuild internal
        ast.recur as (this: Ast, f: (child: Ast) => Ast) => Ast,
      )
    : Option.none();

// An AST without its encoding, as SchemaAST's own `getContextOwner` makes it (exported at run
// time, typed internal): Effect registers the copy as the node's body, which its parser reads.
const bodyOf = (ast: Ast) => {
  if (!Predicate.hasProperty(SchemaAST, "getContextOwner")) return Option.none<Ast>();

  // SAFETY: `getContextOwner(ast)` is SchemaAST's own encoding-free copy, as `flip` uses it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Effect types its body copy internal
  const owner = SchemaAST.getContextOwner as (node: Ast) => Ast;

  return Predicate.isFunction(owner) ? Option.some(owner(ast)) : Option.none<Ast>();
};

// An AST with a node's own context (an optional key, a constructor default) put back, as Effect's
// own `toType` puts it back with SchemaAST's `replaceContext` (exported at run time, typed
// internal).
const withContextOf = (built: Ast, ast: Ast) => {
  const { context } = ast;

  if (context === undefined || !Predicate.hasProperty(SchemaAST, "replaceContext")) return built;

  // SAFETY: `replaceContext(ast, context)` is SchemaAST's own context copy, as `toType` uses it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Effect types its context copy internal
  const replace = SchemaAST.replaceContext as (node: Ast, next: SchemaAST.Context) => Ast;

  return Predicate.isFunction(replace) ? replace(built, context) : built;
};

// RETURN_TYPE: a defect is a failed parse.
const died = (error: Value): Parsed => Exit.die(error);

// A link's transformation as `decodeTo` takes it: Effect appends a middleware link the same way.
const transformationOf = (transformation: SchemaAST.Link["transformation"]) =>
  // SAFETY: `decodeTo` appends `new Link(from, transformation)`, which takes a middleware too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- decodeTo is typed for transformations only
  transformation as Parameters<typeof SchemaAST.decodeTo>[2];

// A transformation's input as its outputs are kept: an optional getter's input is a fresh Option
// at each call, kept by what it holds.
const inputKey = (input: Value) =>
  Option.isOption(input)
    ? Option.getOrElse(
        Option.map(input, (v) => v),
        () => NONE,
      )
    : input;

const NONE = { none: true };

// A parse that a Schema's own code (a check, a transformation) throws out of fails instead.
const guarded = (parse: Parse) => (input: Value) =>
  Result.getOrElse(Result.try({ try: () => parse(input), catch: died }), (failure) => failure);

/**
 * Compiles a parser over an AST that keeps its own stack: each `Schema.suspend` becomes a hole
 * that reads its value's result from the walk's table. A level whose holes miss is parsed again
 * once their values are done.
 */
const compile = (root: Ast) => {
  const holes = new Map<Ast, Ast>();
  const fixed = new WeakSet<Ast>();
  const parsers = new Map<Ast, Parser>();
  let current: Option.Option<Walk> = Option.none();

  const parserOf = (ast: Ast) => {
    const known = parsers.get(ast);

    if (known !== undefined) return known;

    const parser: Parser = SchemaParser.decodeUnknownExit(
      Schema.make<Schema.Codec<Value, Value>>(ast),
    );

    parsers.set(ast, parser);

    return parser;
  };

  const record = (walk: Walk, ast: Ast, input: Value, result: Parsed) => {
    const table = walk.results.get(ast) ?? new Map<Value, Parsed>();

    walk.results.set(ast, table);
    table.set(input, result);

    if (fixed.has(ast) && Exit.isSuccess(result) && result.value !== input)
      table.set(result.value, result);
  };

  // A link's transformation whose decode keeps its outputs by input for the walk on its own
  // stack, where a level is parsed again; Effect reads only its `decode` getter's `_tag` and
  // `transform`.
  const kept = (transformation: SchemaAST.Link["transformation"]) => {
    if (!Predicate.hasProperty(transformation, "decode")) return transformation;

    const getter = transformation.decode;

    if (!Predicate.hasProperty(getter, "transform") || !Predicate.isFunction(getter.transform))
      return transformation;

    // SAFETY: a getter's `transform` takes its input and the parse options; Effect calls it so.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an Effect getter's transform is typed by its own tag
    const transform = getter.transform as (input: Value, options: Value) => Value;

    const keeping = (input: Value, options: Value) => {
      if (Option.isNone(current) || current.value.budget > 0) return transform(input, options);

      const { transformed } = current.value;
      const table = transformed.get(getter) ?? new Map<Value, Value>();
      const key = inputKey(input);

      transformed.set(getter, table);

      if (table.has(key)) return table.get(key);

      const output = transform(input, options);

      // An effectful getter's output is kept once it has run: running it again would make a
      // fresh value.
      if (!Effect.isEffect(output) || Exit.isExit(output)) {
        table.set(key, output);

        return output;
      }

      return Effect.map(output, (made) => {
        table.set(key, Exit.succeed(made));

        return made;
      });
    };

    // SAFETY: the copy keeps every field of the transformation and its getter but `transform`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an Effect getter copied with one field replaced
    return Object.create(transformation, {
      decode: { value: Object.create(getter, { transform: { value: keeping } }) },
    }) as SchemaAST.Link["transformation"];
  };

  // A hole's value: its result if known, parsed on the call stack within the budget, else
  // waiting on the explicit stack.
  const visit = (walk: Walk, target: Ast, input: Value, options: SchemaAST.ParseOptions) => {
    const known = resultOf(walk, target, input);

    if (known !== undefined) return known;

    if (walk.depth < walk.budget) {
      const before = walk.waiting.length;
      const result = walk.deeper(() => parserOf(target)(input, options));

      if (walk.waiting.length === before && !walk.deep) record(walk, target, input, result);

      return result;
    }

    walk.past({ ast: target, input });

    return Exit.succeed(WAITING);
  };

  // RETURN_TYPE: recursive: the holed AST.
  const holeOf = (ast: Ast): Ast => {
    const known = holes.get(ast);

    if (known !== undefined) return known;

    const built = build(ast);
    holes.set(ast, built);

    return built;
  };

  const suspended = (ast: SchemaAST.Suspend) => {
    let target: Option.Option<Ast> = Option.none();

    const targetOf = () => {
      if (Option.isSome(target)) return target.value;

      const inner = ast.thunk();
      const hole = holeOf(inner);

      if (!transforms(inner)) fixed.add(hole);
      target = Option.some(hole);

      return hole;
    };

    return new SchemaAST.Declaration(
      [],
      () => (input, _self, options) =>
        Option.match(current, {
          onNone: () => Exit.die("a hole outside a walk"),
          onSome: (walk) => visit(walk, targetOf(), input, options),
        }),
      ast.annotations,
      undefined,
      undefined,
      ast.context,
    );
  };

  // RETURN_TYPE: recursive: the holed AST.
  const build = (ast: Ast): Ast => {
    if (ast.encoding !== undefined) {
      const links = ast.encoding;

      // Each link appended again, its target holed, in order: `decodeTo` appends one.
      return Option.match(bodyOf(ast), {
        onNone: () => ast,
        onSome: (body) =>
          withContextOf(
            links.reduce<Ast>(
              (built, link) =>
                SchemaAST.decodeTo(
                  holeOf(link.to),
                  built,
                  transformationOf(kept(link.transformation)),
                ),
              holeOf(body),
            ),
            ast,
          ),
      });
    }

    if (SchemaAST.isSuspend(ast)) return suspended(ast);

    return Option.match(rebuildOf(ast), {
      onNone: () => ast,
      onSome: (rebuild) => rebuild.call(ast, holeOf),
    });
  };

  const holed = holeOf(root);

  const within = <A>(walk: Walk, f: () => A) => {
    const saved = current;
    current = Option.some(walk);

    try {
      return f();
    } finally {
      current = saved;
    }
  };

  // Pushes the values a level waits on, but one already on its own path (a cycle), which has no
  // form.
  const pushWaiting = (walk: Walk, stack: Array<Work>, open: Map<Ast, Set<Value>>) => {
    for (const work of walk.waiting.splice(0))
      if (resultOf(walk, work.ast, work.input) === undefined) {
        if (open.get(work.ast)?.has(work.input) === true)
          record(walk, work.ast, work.input, Exit.die("cycle"));
        else stack.push(work);
      }
  };

  // Parses every waiting value before the level that waits on it, from the explicit stack.
  const stacked = (walk: Walk, input: Value) => {
    const stack: Array<Work> = [{ ast: holed, input }];
    const open = new Map<Ast, Set<Value>>();

    for (let top = stack.at(-1); top !== undefined; top = stack.at(-1)) {
      const done = resultOf(walk, top.ast, top.input) !== undefined;
      const result = done ? Option.none() : Option.some(parserOf(top.ast)(top.input, NO_OPTIONS));

      if (Option.isSome(result) && walk.waiting.length > 0) {
        open.set(top.ast, (open.get(top.ast) ?? new Set<Value>()).add(top.input));
        pushWaiting(walk, stack, open);
      } else {
        if (Option.isSome(result)) record(walk, top.ast, top.input, result.value);
        stack.pop();
        open.get(top.ast)?.delete(top.input);
      }
    }

    return resultOf(walk, holed, input) ?? Exit.die("cycle");
  };

  if (holed === root) return guarded((input) => parserOf(root)(input, NO_OPTIONS));

  return guarded((input) => {
    const direct = new Walk(BUDGET);
    const result = within(direct, () => parserOf(holed)(input, NO_OPTIONS));

    if (!direct.deep) return result;

    const walk = new Walk(0);

    return within(walk, () => stacked(walk, input));
  });
};

/**
 * A Schema's walkers, as {@link walkerOf} builds them: its encode to its encoded form, its
 * decode, its type-side check, and its encoded form's canonical text, kept by the value it is.
 */
export type Walker<A, I> = {
  readonly encode: (value: Value) => Result.Result<I, "schema">;
  readonly decode: (value: Value) => Result.Result<A, "schema">;
  readonly is: (value: Value) => value is A;
  readonly text: (value: Value) => Result.Result<Canonical, string>;
  readonly memo: () => { readonly hits: number; readonly misses: number };
};

// A walked value's result, typed by the Schema it was walked by.
const typedOf = <T>(parsed: Parsed) =>
  Exit.isSuccess(parsed)
    ? Result.succeed<T>(
        // SAFETY: the Schema's own parser produced this value from its own AST.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the parser's output has the Schema's type
        parsed.value as T,
      )
    : Result.fail<"schema">("schema");

const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, { Malformed: ({ reason, path }) => `${reason} at ${path}` });

/**
 * A Schema's walkers: its encode to its encoded form, its decode, its type-side check, and its
 * encoded form's canonical text, each built once from the Schema's AST and run without the call
 * stack.
 *
 * **When to use**
 *
 * For every value that crosses into Flow: memory, selections, payloads, commit inputs, keys and
 * records. Build one per Schema at compile time and keep it beside the Schema.
 *
 * **Details**
 *
 * Effect's own parser does the work, one recursion level at a time: each `Schema.suspend` is read
 * from a table of the walk's results, so a value of any depth is walked on an explicit stack and a
 * value shared twice is walked once. A value whose levels fit the budget is parsed once, directly.
 * `text` keeps each object's text, so an unchanged part (memory is immutable) is walked once.
 *
 * **Gotchas**
 *
 * - A value met again on its own path under one Schema (a cycle) fails.
 * - A Schema's own code that throws fails the walk; nothing is thrown.
 * - `text` serves an object's first text again: an object mutated in place is not re-read; admitted
 *   values are immutable by contract, and dev and test hosts freeze them. `memo` counts its hits.
 */
export const walkerOf = <S extends Schema.Constraint>(schema: S) => {
  const encoder = compile(SchemaAST.flip(schema.ast));
  const decoder = compile(schema.ast);
  const checker = compile(SchemaAST.toType(schema.ast));
  const texts = new WeakMap<WeakKey, Result.Result<Canonical, string>>();
  const counts = { hits: 0, misses: 0 };

  const encode = (value: Value) => typedOf<S["Encoded"]>(encoder(value));

  const textOf = (value: Value) =>
    Result.flatMap(encode(value), (json) =>
      Result.mapBoth(writeCanonical(json), {
        onFailure: reasonOf,
        onSuccess: (text) => new Canonical({ text }),
      }),
    );

  const text = (value: Value) => {
    if (!Predicate.isObjectOrArray(value)) return textOf(value);

    const known = texts.get(value);

    if (known !== undefined) {
      counts.hits += 1;

      return known;
    }

    const made = textOf(value);
    counts.misses += 1;
    texts.set(value, made);

    return made;
  };

  const walker: Walker<S["Type"], S["Encoded"]> = {
    encode,
    text,
    memo: () => ({ ...counts }),
    decode: (value) => typedOf<S["Type"]>(decoder(value)),
    // RETURN_TYPE: a type guard states the type it narrows to.
    is: (value): value is S["Type"] => Exit.isSuccess(checker(value)),
  };

  return walker;
};
