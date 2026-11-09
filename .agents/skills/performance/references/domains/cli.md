# CLI

1. Measure cold command startup, first output, total completion, throughput, exit behavior, and peak
   memory separately. Include help/version, tiny inputs, large piped inputs, and repeated
   invocation.

2. Trace argument parsing, runtime/module loading, configuration discovery, directory traversal,
   processing, and output. Avoid initializing unrelated subsystems for every command.

3. Stream stdin and stdout where semantics allow; preserve ordering and exit status. Buffer
   sensibly, honor downstream backpressure, and handle broken pipes and cancellation.

4. Reduce per-item process launches and filesystem calls; batch or reuse work when justified.
   Compare long-running workers against lifecycle complexity and deployment constraints.

5. Test cold filesystem caches, missing files, malformed input, noninteractive execution, and
   bounded-memory large inputs. Keep machine-readable output separate from diagnostics.

## Sources

- [Command Line Interface Guidelines](https://clig.dev/)
