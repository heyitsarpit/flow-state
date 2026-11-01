---
name: benchmark-checklist
description: >-
  Vet a performance measurement before reporting or acting on it: limiter, tuning, physical
  limits, errors, repeatability, relevance, and completed work. Use for benchmark comparisons
  and measured speedup or regression claims.
metadata:
  kind: procedure
---

# Benchmark Checklist

Use this when you produce a performance number: a before and after, a regression claim, a
hillclimb harness, or a library or configuration choice. Explain the Number (Use the
`explain-the-number` skill) says why. Answer each question with evidence
from a run, not a guess about the code.

For a quick ballpark the user asked for, one run is enough. Still check questions 4 and 7 and say
it is one run. Skip the rest unless it looks wrong. A choice between options is not a ballpark.

## Before you run anything

- Write down the claim you expect to make, in the words you would ship: "export is 30% faster
  at p50 on the 60k-row dataset." The questions test that sentence.
- Read the measurement script. Note what it times, what it counts, and what it ignores.
- Inspect machine load and available resources with tools supported on the current platform.
  If the machine is busy, find out what is running. Do not stop unrelated work; interleave the
  sides so both see the same noise, and say so in the report.

## The questions

1. **Why not double?** Name the limiter. Profile in a separate run you do not report as timing:
   profilers and tracers slow the work down. Use available CPU, I/O, allocation, or runtime tools
   and map the hot spot to source. Watch the load generator too. If it saturates first, you measured
   the load generator. If a change did not move the number, find the limiter before calling the
   change useless.
2. **Was it tuned?** Run every side the way production runs it: release builds, flags, environment,
   batching, transactions, connection pools, warm or cold caches, versions, and data. If one side
   runs on defaults, you compared configurations, not implementations. A limiter that is a setting,
   such as a commit per row, a debug build, or a missing index, means that side is untuned.
   Tune it and measure again before choosing what to adopt. If you cannot tune it, do not pick a
   winner from that run; narrowing the claim to today's settings does not settle an adoption choice.
3. **Did it break limits?** Do the arithmetic. Compare bytes per second with disk and network
   bandwidth, and operations per second times cost per operation with the cores available.
   Compare time saved with the time the changed piece took. Removing a piece taking 10% of a run
   can make the run at most about 11% faster. A result past a limit means you measured something
   else, such as a cache, a no-op, or a bug.
4. **Did it error?** Count failures and non-success responses. Check outputs are correct, not just
   present. Errors behave differently from successes: rejections are often fast, and timeouts and
   retries are slow. If the script does not count errors, add the count within the allowed scope.
   If it cannot be changed, mark the evidence gap rather than accepting the number.
5. **Does it reproduce?** Run each side at least five times and alternate A, B, A, B so warmup,
   lazy initialization, caches, and drift do not favor one side. Report the median and range.
   Treat a gap smaller than run-to-run variation as no measurable difference. When close, use the
   harness's statistics or a suitable rank-sum comparison. If the run budget prevents adequate
   sampling, report the limitation instead of silently expanding it.
   Set sampling and the decision rule before comparing. Retain earlier inconclusive batches
   when changing the measurement method; do not report only a favorable rerun.
6. **Does it matter?** Next to a micro result, measure the end-to-end path a consumer waits on,
   with realistic data sizes and concurrency. Report the micro result as a share of the whole.
   A helper taking 1% of a request can save at most 1% of its original duration.
7. **Did it even happen?** Confirm the work ran inside the timed region: requests reached the
   server, rows were written, bytes were read, and the result was consumed. Lazy code, unawaited
   promises, discarded results, and timeouts can print numbers for work that never happened.

## Report

- Lead with the verdict: faster, slower, no measurable difference, or inconclusive.
- Give the number with its unit, run count, range, and limiter: "p50 41 ms → 33 ms, median of seven
  runs per side, range 32–35 ms after, bound by JSON parsing on one core."
- Call the comparison inconclusive when you claim a difference but cannot name the limiter,
  a side ran untuned, or questions 4 and 7 could not be checked. Name the gap.
- Tie evidence to code and harness revisions, workload, build, environment, and commands.
  A benchmark audit does not authorize commits, a dependency choice, or a changed performance goal.

This procedure vets a baseline before optimization and every reported number afterward.
For hillclimb, vet the harness before freezing it; its error and work counts support each later
keep-or-reject decision. Changing measurement conditions invalidates prior comparisons.
