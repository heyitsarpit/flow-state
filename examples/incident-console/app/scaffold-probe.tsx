"use client";

import { useState } from "react";

export function ScaffoldProbe() {
  const [verified, setVerified] = useState(false);

  return (
    <section className="mt-8 border-t pt-6" aria-labelledby="browser-harness-heading">
      <h2 id="browser-harness-heading" className="text-lg font-medium">
        Browser harness
      </h2>
      <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
        {verified ? "Chromium interaction verified." : "Ready for an interaction check."}
      </p>
      <button
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        type="button"
        onClick={() => setVerified(true)}
        disabled={verified}
      >
        {verified ? "Verified" : "Verify interaction"}
      </button>
    </section>
  );
}
