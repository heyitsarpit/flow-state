import { ScaffoldProbe } from "./scaffold-probe";

export default function Page() {
  return (
    <main className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border bg-card p-8 text-card-foreground shadow-xl shadow-foreground/5">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Flow State experimental alpha
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Incident Console</h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
        The Phase 6 Next.js and browser-acceptance scaffold is ready for the real client/server
        application.
      </p>
      <ScaffoldProbe />
    </main>
  );
}
