import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createFlowPreview, packageInfo } from "@flow-state/core";

function App() {
  const preview = createFlowPreview();

  return (
    <main>
      <h1>Flow State</h1>
      <p>{packageInfo.status}</p>
      <dl>
        <dt>Runtime</dt>
        <dd>{preview.label}</dd>
        <dt>Machine</dt>
        <dd>{preview.initialState}</dd>
        <dt>Primitives</dt>
        <dd>{preview.primitives.join(", ")}</dd>
      </dl>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
