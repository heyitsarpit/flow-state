"use client";
import { useState, type ReactNode } from "react";
import { FlowProvider } from "flow-state/react";
import { deskBrowserSetup } from "./browser-setup.js";

export function DeskProviders({ userId, children }: { userId: string; children: ReactNode }) {
  // The keyed parent remounts on principal changes; construct is inert during server render.
  const [runtime] = useState(() => deskBrowserSetup(userId).construct());
  return <FlowProvider runtime={runtime}>{children}</FlowProvider>;
}
