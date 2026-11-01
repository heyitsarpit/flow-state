# Comparison apps

Three small apps, built in four systems: **A** (`proposal-v2.md`), **B**
(`spec-b-locked-split.md`), **C** (`spec-c-single-fragment.md`; all three removed, see
[the folder README](../README.md)) and the **baseline** (plain machines as
[Machines.plan](../../../../Machines.plan) and [Operations.plan](../../../../Operations.plan) describe
them today, no fragments). Every build implements exactly the behaviour below, so the code can be
compared line for line. Operation names and shapes are fixed here; adapters are out of scope.

## 1. Two-factor sign-in

A `SignIn` actor: `PASSWORD → TWO_FACTOR → SIGNED_IN`. The password step is a stub (one event
`PasswordAccepted { challengeId }`); the two-factor step is the subject.

- A 6-digit code field. Invalid until it has exactly 6 digits; the error shows after the first edit.
- **Submit** (only when valid) calls `O.Auth.verifyCode` (a commit; input `{ challengeId, code }`;
  failure tags `WrongCode`, `Expired`).
  - success → `SIGNED_IN`;
  - `WrongCode` → wrong attempts + 1, error "Wrong code, N tries left", code field cleared;
  - after the **3rd** wrong code → **locked out for 5 minutes**: entry and Submit refused, a visible
    countdown of remaining seconds, then back to entering with attempts reset;
  - `Expired` → error "Code expired, send a new one";
  - `unknown` / `interrupt` / `defect` → error "Couldn't check the code, try again"; not counted as
    a wrong attempt.
- **Resend code** calls `O.Auth.resendCode` (a commit; input `{ challengeId }`). After each resend,
  Resend is refused for **30 seconds**, with a visible countdown. Resend is allowed while entering
  and while locked out.
- **Back to password** leaves to `PASSWORD` from anywhere in the step, keeping nothing.

## 2. Signup wizard

A `Signup` actor with pages **Account → Profile → Invite → Review**, then `DONE`.

- **Account:** email (must contain `@`) and password (at least 12 characters).
- **Profile:** name (required) and role (`"engineer" | "designer" | "manager"`, required).
- **Invite:** a list of 0–5 teammate email fields. Add appends an empty field (refused at 5);
  Remove deletes one. Each non-empty entry must contain `@`; empty entries are dropped on Next.
- **Next** is refused while the page is invalid. **Back** returns to the previous page. Every page
  keeps its drafts across Back and Next.
- **Cancel** on any page opens "Discard your signup?": **Discard** → `CANCELLED`; **Keep** → back to
  the same page with drafts intact.
- **Review** shows everything; **Submit** calls `O.Accounts.create` (a commit; input
  `{ email, password, name, role, invites }`; failure tags `EmailTaken`, `Busy`).
  - success → `DONE`;
  - `EmailTaken` → back to Account with error "That email is registered";
  - `Busy` → retry automatically up to **3** times with backoff 1 s, 2 s, 4 s, showing
    "Server busy, retrying (n/3)"; after the 3rd retry fails → Review with error "Try again later";
  - `unknown` / `interrupt` / `defect` → `UNSURE`: "Your account may have been created; check your
    email". Never retried automatically.
  - Cancel is refused while submitting.

## 3. Issue list screen

An `IssueList` actor for one screen. Reads `O.Issues.list` (a resource; query
`{ search, sort: { field: "updated" | "title", dir: "asc" | "desc" }, status: "open" | "closed" | "all", page }`;
returns `{ items: Issue[], total }`, page size 20). `Issue` is `{ id, title, status, pinned }`.

- **Search** box: the query updates 300 ms after the last keystroke; changing it resets to page 1.
- **Sort** and **status filter**: change immediately; reset to page 1.
- **Pagination:** Next and Previous, refused past either end.
- **Selection:** a checkbox per row and "select all on this page". Selection is cleared whenever the
  query (search, sort, status, page) changes.
- **Pin** per row, optimistic: the row shows the new value immediately and calls `O.Issues.setPinned`
  (a commit; input `{ id, pinned }`). On failure (any non-success outcome) the row reverts and a
  flash message "Couldn't pin <title>" shows for **3 seconds**. Pins on different rows may be in
  flight at once; a second click on a row whose pin is in flight is refused.
- **Bulk delete:** a **hold-to-confirm** button (hold 1.5 s; releasing early cancels) deletes the
  selected issues with `O.Issues.deleteMany` (a commit; input `{ ids }`). Refused when nothing is
  selected. On success: clear the selection and refetch. On failure: flash "Delete failed".
  `unknown`: flash "Delete may have happened" and refetch.
- **Refresh:** the list refetches every **30 seconds** while the screen is open.

## What every build delivers

For each app: shared fragments (none in the baseline), the definition, the machine, the
component(s) that send and read, and one Story test. Full, untruncated code. Mark every workaround
with a `// FAKED:` comment saying what is faked (modes kept in memory, host wiring standing in for a
reusable piece, logic duplicated, a convention instead of a rule) and why. After each app: lines of
code (fragments, definition, machine, components), new keywords used, and logic duplicated across
the three apps.
