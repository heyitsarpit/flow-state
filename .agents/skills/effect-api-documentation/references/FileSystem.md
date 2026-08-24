# `FileSystem`

Source: [Effect v4 `FileSystem` API](https://www.effect.website/docs/v4/api/effect/FileSystem). Examples assume `import { Effect, FileSystem, Stream } from "effect"`.

## API index

1. [FileSystem.FileSystem](#filesystemfilesystem)
2. [FileSystem.readFileString](#filesystemreadfilestring)
3. [FileSystem.writeFileString](#filesystemwritefilestring)
4. [FileSystem.readFile](#filesystemreadfile)
5. [FileSystem.writeFile](#filesystemwritefile)
6. [FileSystem.stream](#filesystemstream)
7. [FileSystem.sink](#filesystemsink)
8. [FileSystem.open](#filesystemopen)
9. [FileSystem.makeTempFileScoped](#filesystemmaketempfilescoped)
10. [FileSystem.watch](#filesystemwatch)
11. [FileSystem.exists](#filesystemexists)
12. [FileSystem.makeDirectory](#filesystemmakedirectory)
13. [FileSystem.remove](#filesystemremove)
14. [FileSystem.layerNoop](#filesystemlayernoop)

### Additional known APIs (not expanded)

`TypeId`, `access`, `copy`, `copyFile`, `chmod`, `chown`, `glob`, `link`, `makeTempDirectory`, `makeTempDirectoryScoped`, `makeTempFile`, `readDirectory`, `readLink`, `realPath`, `rename`, `stat`, `symlink`, `truncate`, `utimes`, `Size`, `SizeInput`, `KiB`, `MiB`, `GiB`, `TiB`, `PiB`, `make`, `makeNoop`, `FileTypeId`, `isFile`, `File`, `FileDescriptor`, `SeekMode`, `WatchEvent`, `WatchBackend`

### [FileSystem.FileSystem](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:751)

The service tag supplies injectable file-system operations, keeping production, tests, and platform implementations behind one boundary.

```ts
const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString("config.json");
});
```

### [FileSystem.readFileString](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:243)

Reads a file and decodes it to text while preserving platform failures in the effect error channel.

```ts
const config = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString("config.json");
});
```

### [FileSystem.writeFileString](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:361)

Encodes and writes text to a path with optional file flags and permissions.

```ts
const save = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString("out.txt", "hello");
});
```

### [FileSystem.readFile](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:237)

Reads raw bytes when the caller needs to control decoding or binary processing.

```ts
const bytes = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFile("image.bin");
});
```

### [FileSystem.writeFile](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:350)

Writes raw bytes to a path without coupling the operation to a text encoding.

```ts
const bytes = new TextEncoder().encode("hello");
const save = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFile("out.txt", bytes);
});
```

### [FileSystem.stream](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:312)

Creates a readable byte stream for large files, with chunk size, offset, and byte-limit controls.

```ts
const chunks = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return fs.stream("archive.bin", { chunkSize: FileSystem.KiB(64) });
});
```

### [FileSystem.sink](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:285)

Creates a writable byte sink for streaming output directly to a file.

```ts
const copy = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* Stream.run(fs.stream("input.bin"), fs.sink("output.bin"));
});
```

### [FileSystem.open](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:213)

Opens a file as a scoped handle that closes automatically when the surrounding scope ends.

```ts
const read = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const file = yield* fs.open("data.bin", { flag: "r" });
  return yield* file.readAlloc(FileSystem.KiB(4));
}));
```

### [FileSystem.makeTempFileScoped](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:201)

Creates a temporary file and registers its deletion with the current scope.

```ts
const temp = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* fs.makeTempFileScoped({ prefix: "job-" });
  yield* fs.writeFileString(path, "temporary");
  return path;
}));
```

### [FileSystem.watch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:346)

Produces a stream of create, update, and remove events for a file or directory.

```ts
const changes = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return fs.watch("./config");
});
```

### [FileSystem.exists](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:134)

Checks for path existence without forcing callers to interpret a not-found failure.

```ts
const present = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists("config.json");
});
```

### [FileSystem.makeDirectory](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:148)

Creates a directory and can recursively create missing parent directories.

```ts
const prepare = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory("./cache/data", { recursive: true });
});
```

### [FileSystem.remove](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:262)

Removes a file or directory with explicit recursive and force behavior.

```ts
const cleanup = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.remove("./cache", { recursive: true, force: true });
});
```

### [FileSystem.layerNoop](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FileSystem.ts:1040)

Provides a no-op or partially overridden file system layer for deterministic tests.

```ts
const testLayer = FileSystem.layerNoop({
  readFileString: () => Effect.succeed("fixture"),
  exists: () => Effect.succeed(true),
});
```
