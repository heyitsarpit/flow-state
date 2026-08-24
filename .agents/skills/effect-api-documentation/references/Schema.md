# `Schema`

Source: [Effect v4 `Schema` API](https://www.effect.website/docs/v4/api/effect/Schema). Examples assume `import { Schema } from "effect"`.

## API index

1. [Schema.Schema](#schemaschema)
2. [Schema.Type](#schematype)
3. [Schema.Codec.Encoded](#schemacodecencoded)
4. [Schema.Codec.DecodingServices](#schemacodecdecodingservices)
5. [Schema.Codec.EncodingServices](#schemacodecencodingservices)
6. [Schema.toType](#schematotype)
7. [Schema.toEncoded](#schematoencoded)
8. [Schema.TaggedStruct](#schemataggedstruct)
9. [Schema.Opaque](#schemaopaque)
10. [Schema.Struct](#schemastruct)
11. [Schema.decodeUnknownEffect](#schemadecodeunknowneffect)
12. [Schema.decodeUnknownSync](#schemadecodeunknownsync)
13. [Schema.encodeEffect](#schemaencodeeffect)
14. [Schema.String](#schemastring)
15. [Schema.Number](#schemanumber)
16. [Schema.Literal](#schemaliteral)
17. [Schema.Union](#schemaunion)
18. [Schema.TaggedUnion](#schemataggedunion)
19. [Schema.Array](#schemaarray)
20. [Schema.Record](#schemarecord)
21. [Schema.Tuple](#schematuple)
22. [Schema.optional](#schemaoptional)
23. [Schema.brand](#schemabrand)
24. [Schema.DateFromString](#schemadatefromstring)

### Additional known APIs (not expanded)

`Constraint`, `Top`, `Codec`, `Decoder`, `Encoder`, `SchemaError`, `declareConstructor`, `declare`, `revealBottom`, `annotate`, `annotateEncoded`, `annotateKey`, `revealCodec`, `toStandardSchemaV1`, `toStandardJSONSchemaV1`, `is`, `asserts`, `decodeEffect`, `decodeExit`, `decodeUnknownExit`, `decodeOption`, `decodeUnknownOption`, `decodeResult`, `decodeUnknownResult`, `decodePromise`, `decodeUnknownPromise`, `decodeSync`, `encodeUnknownEffect`, `encodeUnknownExit`, `encodeExit`, `encodeOption`, `encodeUnknownOption`, `encodeResult`, `encodeUnknownResult`, `encodePromise`, `encodeUnknownPromise`, `encodeUnknownSync`, `encodeSync`, `make`, `asClass`, `isSchema`, `optionalKey`, `requiredKey`, `required`, `mutableKey`, `readonlyKey`, `toType`, `toEncoded`, `flip`, `TemplateLiteral`, `Enum`, `Literals`, `Unknown`, `Never`, `Null`, `Undefined`, `Boolean`, `BigInt`, `Array`, `NonEmptyArray`, `ArrayEnsure`, `TupleWithRest`, `TaggedStruct`, `toTaggedUnion`, `Date`, `DateFromMillis`, `DateValid`, `NumberFromString`, `StringFromBase64`, `StringFromHex`, `URL`, `Duration`, `DateTimeUtc`, `DateTimeZoned`

### [Schema.Schema](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:825)

Describes a typed value together with decoding, encoding, and validation behavior.

```ts
const UserId: Schema.Schema<string> = Schema.String;
```

### [Schema.Type](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:792)

Extracts a schema's decoded `Type`; the schema also exposes that type through its `Type` field. The [Schema getting-started recipe](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/schema/getting-started.mdx) shows both forms.

```ts
const Person = Schema.Struct({ name: Schema.String, age: Schema.Number });
type PersonType = Schema.Schema.Type<typeof Person>;
type PersonTypeDirect = typeof Person.Type;
```

### [Schema.Codec.Encoded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:852)

Extracts a schema's encoded representation, which can differ from its decoded `Type`.

```ts
const NumberFromString = Schema.NumberFromString;
type Encoded = Schema.Codec.Encoded<typeof NumberFromString>; // string
type EncodedDirect = typeof NumberFromString.Encoded; // string
```

### [Schema.Codec.DecodingServices](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:870)

Extracts the services required while decoding a schema. Decoding and encoding requirements are tracked separately; the [Schema transformations recipe](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/schema/transformations.mdx) demonstrates direction-specific requirements.

```ts
const Person = Schema.Struct({ name: Schema.String });
type DecodingServices = Schema.Codec.DecodingServices<typeof Person>; // never
type DecodingServicesDirect = typeof Person.DecodingServices; // never
```

### [Schema.Codec.EncodingServices](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:888)

Extracts the services required while encoding a schema.

```ts
const Person = Schema.Struct({ name: Schema.String });
type EncodingServices = Schema.Codec.EncodingServices<typeof Person>; // never
type EncodingServicesDirect = typeof Person.EncodingServices; // never
```

### [Schema.toType](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:2514)

Creates a type-side schema view that sets `Encoded` to the decoded `Type` and discards the encoding transformation path.

```ts
const TypeView = Schema.toType(Schema.NumberFromString);
type Type = typeof TypeView.Type; // number
type Encoded = typeof TypeView.Encoded; // number
```

### [Schema.toEncoded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:2556)

Creates an encoded-side schema view that sets `Type` to the original `Encoded` type and discards the decoding transformation path.

```ts
const EncodedView = Schema.toEncoded(Schema.NumberFromString);
type Type = typeof EncodedView.Type; // string
type Encoded = typeof EncodedView.Encoded; // string
```

### [Schema.TaggedStruct](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:6070)

Creates a struct schema with a literal `_tag`; `make` fills the tag, while decoding and encoding require it in the input.

```ts
const User = Schema.TaggedStruct("User", { name: Schema.String });
const constructed = User.make({ name: "Ada" });
const decoded = Schema.decodeUnknownSync(User)({ _tag: "User", name: "Ada" });
```

### [Schema.Opaque](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:6324)

Wraps a schema so its decoded `Type` is a nominal `Self` type while retaining the base schema's encoded and service views.

```ts
class Person extends Schema.Opaque<Person>()(Schema.Struct({ name: Schema.String })) {}
const person = Schema.decodeUnknownSync(Person)({ name: "Alice" });
type PersonType = Schema.Schema.Type<typeof Person>; // Person
```

### [Schema.Struct](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:3452)

Builds an object schema from named field schemas and derives its decoded type.

```ts
const User = Schema.Struct({ id: Schema.String, age: Schema.Number });
const user = Schema.decodeUnknownSync(User)({ id: "u1", age: 30 });
```

### [Schema.decodeUnknownEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:1368)

Decodes unknown input into an `Effect` that fails with `SchemaError` when validation fails.

```ts
import { Effect, Schema } from "effect";

const decode = Schema.decodeUnknownEffect(Schema.Number);
const program = decode("42").pipe(Effect.catchAll(() => Effect.succeed(0)));
```

### [Schema.decodeUnknownSync](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:1767)

Decodes unknown input synchronously and throws when the schema rejects it.

```ts
const value = Schema.decodeUnknownSync(Schema.Number)(42);
```

### [Schema.encodeEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:1868)

Encodes a value already typed by the schema into an `Effect` result.

```ts
import { Effect, Schema } from "effect";

const program = Schema.encodeEffect(Schema.NumberFromString)(42);
Effect.runPromise(program).then(console.log);
```

### [Schema.String](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:3017)

Validates string values and supplies the string type to combinators.

```ts
const value = Schema.decodeUnknownSync(Schema.String)("hello");
```

### [Schema.Number](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:3041)

Validates number values.

```ts
const value = Schema.decodeUnknownSync(Schema.Number)(42);
```

### [Schema.Literal](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:2656)

Accepts exactly one literal value and narrows the decoded type to that literal.

```ts
const Ok = Schema.Literal("ok");
const value = Schema.decodeUnknownSync(Ok)("ok");
```

### [Schema.Union](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:4804)

Accepts input matching any member schema.

```ts
const Id = Schema.Union([Schema.String, Schema.Number]);
const value = Schema.decodeUnknownSync(Id)("user-1");
```

### [Schema.TaggedUnion](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:6259)

Builds a discriminated union from cases and adds tag-based guards and matching.

```ts
const Event = Schema.TaggedUnion({
  Created: { id: Schema.String },
  Deleted: { id: Schema.String },
});
const event = Schema.decodeUnknownSync(Event)({ _tag: "Created", id: "u1" });
```

### [Schema.Array](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:4534)

Builds a readonly array schema from an element schema.

```ts
const Tags = Schema.Array(Schema.String);
const tags = Schema.decodeUnknownSync(Tags)(["api", "v4"]);
```

### [Schema.Record](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:3829)

Builds a record schema with validated dynamic keys and values.

```ts
const Scores = Schema.Record(Schema.String, Schema.Number);
const scores = Schema.decodeUnknownSync(Scores)({ alice: 10 });
```

### [Schema.Tuple](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:4291)

Builds a fixed-length tuple schema with per-position schemas.

```ts
const Entry = Schema.Tuple([Schema.String, Schema.Number]);
const entry = Schema.decodeUnknownSync(Entry)(["attempts", 3]);
```

### [Schema.optional](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:2386)

Allows a struct field to be absent or explicitly `undefined`.

```ts
const User = Schema.Struct({ name: Schema.String, nickname: Schema.optional(Schema.String) });
const user = Schema.decodeUnknownSync(User)({ name: "Ada" });
```

### [Schema.brand](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:5120)

Adds a nominal TypeScript brand to an existing schema without changing runtime checks.

```ts
const UserId = Schema.String.pipe(Schema.brand("UserId"));
const id = Schema.decodeUnknownSync(UserId)("u1");
```

### [Schema.DateFromString](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts:10532)

Decodes string-encoded dates into JavaScript `Date` values.

```ts
const date = Schema.decodeUnknownSync(Schema.DateFromString)("2024-01-01");
```
