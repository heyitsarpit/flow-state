# Fixture review A

Prose before the log is ignored.

## Sidecar log

Four Haiku sidecars, effort high, read-only.

| Sidecar  | Item                 | Result                              |
| -------- | -------------------- | ----------------------------------- |
| Blind    | 1 missing guard      | accepted (read `x.ts:3`)            |
| Blind    | 2 naming             | rejected: style only                |
| Blind    | 3 race               | changed: narrowed                   |
| Standing | 1 minor helper       | accepted, minor                     |
| Standing | 2 comment wording    | noted: later                        |
