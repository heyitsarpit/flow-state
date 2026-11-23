import { useActorByRef, useView } from "flow-state/react";
import { Toasts } from "./toasts.definition.js";
import { ToastsRef } from "./toasts.ref.js";

export function ToastStack() {
  // An options object ensures; a machine without input takes no input field. Without the
  // object the hook only looks the actor up.
  const toasts = useActorByRef(ToastsRef, {});
  const messages = useView(toasts, (s) => s.memory.messages);

  return (
    <ol aria-live="polite" className="toasts">
      {messages.map((text, index) => (
        <li key={index}>
          {text} <button onClick={() => toasts.send(Toasts.E.Dismiss())}>Dismiss</button>
        </li>
      ))}
    </ol>
  );
}
