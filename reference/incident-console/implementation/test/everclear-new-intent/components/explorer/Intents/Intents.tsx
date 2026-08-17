import { useState } from "react";
import {
  useIntentsCommands,
  useIntentsFailure,
  useIntentsFilters,
  useIntentsLabels,
  useIntentsLoading,
  useIntentsPagination,
  useIntentsRefreshing,
  useIntentsRows,
  useIntentsShowingPreviousRows,
} from "../../../flow-state/react";

export function Intents() {
  const filters = useIntentsFilters();
  const rows = useIntentsRows();
  const showingPreviousRows = useIntentsShowingPreviousRows();
  const pagination = useIntentsPagination();
  const labels = useIntentsLabels();
  const loading = useIntentsLoading();
  const refreshing = useIntentsRefreshing();
  const failure = useIntentsFailure();
  const commands = useIntentsCommands();
  const [hoveredIntentId, setHoveredIntentId] = useState<string | null>(null);

  return (
    <section>
      <header className="flex gap-2">
        <input
          aria-label="Search intents"
          value={filters.search}
          onChange={(event) =>
            commands.changeFilters({
              search: event.currentTarget.value,
              status: filters.status,
              userAddress: filters.userAddress,
            })
          }
        />
        <select
          value={filters.status}
          onChange={(event) => {
            const status = event.currentTarget.value;
            if (status !== "all" && status !== "pending" && status !== "settled") return;
            commands.changeFilters({
              search: filters.search,
              status,
              userAddress: filters.userAddress,
            });
          }}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="settled">Settled</option>
        </select>
        <button disabled={refreshing} onClick={commands.refresh}>
          Refresh
        </button>
      </header>

      {failure !== null && <p role="alert">{failure.message}</p>}
      {showingPreviousRows && <p>Refreshing results…</p>}
      {loading && rows.length === 0 ? (
        <p>Loading intents…</p>
      ) : (
        <ul>
          {rows.map((intent) => (
            <li
              key={intent.id}
              onMouseEnter={() => setHoveredIntentId(intent.id)}
              onMouseLeave={() => setHoveredIntentId(null)}
            >
              <a href={`/intents/${intent.id}`}>{intent.id}</a> · {intent.status} ·{" "}
              {labels[intent.user] ?? intent.user}
              {hoveredIntentId === intent.id && <span> →</span>}
            </li>
          ))}
        </ul>
      )}

      <footer className="flex gap-2">
        <button disabled={!pagination.canGoBack} onClick={commands.previousPage}>
          Previous
        </button>
        <button
          disabled={pagination.nextCursor === null}
          onClick={() => pagination.nextCursor !== null && commands.nextPage(pagination.nextCursor)}
        >
          Next
        </button>
      </footer>

      {/* Hover remains local because losing it on remount changes no resource identity or command. */}
    </section>
  );
}
