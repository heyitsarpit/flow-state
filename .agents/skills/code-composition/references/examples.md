# Composition examples

## 1. Submitting a notification

- Provider acceptance is not proof of delivery.
- Code constructs illustrate boundaries, not a required directory or class layout.

### Composition tree

```text
Notification module                         notification workflow
└── submitNotification(request)
    ├── validateRecipient(raw)              function: recipient format              protocols: RawRecipient -> ValidatedRecipient
    ├── buildMessage(recipient, content)    function: message construction          protocols: ValidatedRecipient + Content -> PreparedMessage
    └── NotificationSender.submit(message)  class:    provider submission           protocols: PreparedMessage -> SubmissionReceipt
        ├── encodeRequest(message)          function: provider wire format          protocols: PreparedMessage -> ProviderRequest
        ├── ProviderTransport.post(request) module:   authenticated HTTP exchange
        └── decodeReceipt(response)         function: provider response format
```

- Submission is a concern; NotificationSender is its boundary and a composite internally.
- ProviderTransport can compose smaller boundaries under the same rules.

### Workflow level: Notification module

```text
submitNotification
  input    NotificationRequest
  returns  SubmissionReceipt
  fails    InvalidRecipient | InvalidContent | NotificationSubmissionFailed
  needs    NotificationSender
```

- **Policy:** validate before submission; decide how the workflow handles failure.
- **Validation:** declare incoming data constraints in a schema (e.g. Effect Schema or Zod).
  validateRecipient checks raw input at entry and produces ValidatedRecipient or InvalidRecipient.
  buildMessage then transforms validated data; it does not repeat those input checks.
- **Protocols:** values follow NotificationRequest → SubmissionReceipt. ValidatedRecipient values
  carry checked format into message construction; PreparedMessage values cross into the sender.
- **Hidden knowledge:** provider headers, status codes, and wire encoding.

### Submission level: NotificationSender class

```text
submit
  input    PreparedMessage
  returns  SubmissionReceipt
  fails    SubmissionFailed | SubmissionUncertain
  needs    ProviderTransport
```

- **Protocols:** PreparedMessage → SubmissionReceipt. The receipt value passes unchanged through
  sender and notification module; composition does not require a new protocol at each level.
- **Composition:** encode → post → decode; translate failures, preserving causes and uncertainty.
- **Policy:** this example keeps retries in the workflow. Sender and transport do not also retry.
  Retrying requires provider idempotency or an explicit duplicate-submission risk.
- **Cohesion:** lookupSubmission can share this class when it needs the same provider knowledge.

### Encoding and transport level

- **Encoding boundary:** encapsulates wire-format knowledge.
  **Protocols:** PreparedMessage → ProviderRequest.

```text
encodeRequest
  input    PreparedMessage
  returns  ProviderRequest
  fails    none for a valid PreparedMessage
  needs    none
```

- **Transport boundary:** controls authenticated exchange.
  **Protocols:** ProviderRequest → ProviderResponse.

```text
post
  input    ProviderRequest
  returns  ProviderResponse
  fails    TransportFailed | SubmissionUncertain
  needs    ProviderCredentials, HttpClient
```

- **Decoding boundary:** encapsulates response-format knowledge.
  **Protocols:** ProviderResponse → SubmissionReceipt.

```text
decodeReceipt
  input    ProviderResponse
  returns  SubmissionReceipt
  fails    ProviderRejected | InvalidProviderResponse
  needs    none
```

- **Closure:** the sender exposes submission outcomes, hiding raw transport and decoder failures.
- **Dependencies:** the sender supplies transport; required external dependencies stay explicit.
  Transport borrows a caller-managed HTTP client; composition does not transfer client ownership.

## 2. Shared protocols across document analysis

- **Document:** an immutable input snapshot with text and links; link spans are within text bounds.
- **Findings:** diagnostics with rule codes, spans, and messages; empty means a check found none.
- Both protocols have one shared definition. They carry the same meaning at every boundary below.

```text
Analysis.analyze [module]           whole-document checks    protocols: Document -> Findings
├── TextChecks.analyze [module]     text checks              protocols: Document -> Findings
│   ├── Spelling.check [module]     spelling rules           protocols: Document -> Findings
│   └── Style.check [module]        style rules              protocols: Document -> Findings
└── LinkChecks.analyze [module]     link checks              protocols: Document -> Findings
    ├── Syntax.check [function]     link syntax              protocols: Document -> Findings
    └── Policy.check [function]     allowed link schemes     protocols: Document -> Findings
```

- **Across levels:** Analysis passes the same Document to TextChecks, which passes it to Spelling
  and Style. Findings return through those boundaries without wrapper protocols for each level.
- **Across peers:** TextChecks and LinkChecks consume the same Document; Spelling and Style do too.
  All produce Findings that their caller combines into another Findings value.
- **Policy:** each composite selects its checks and merges results in stable document/rule order.
  These independent checks can run in parallel without changing the shared protocols.
- **Hidden knowledge:** dictionaries, style rules, and scheme policy stay behind their boundaries.
  None of these checks proves a remote link is reachable; that requires a different check.
