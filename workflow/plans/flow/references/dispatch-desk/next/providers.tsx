"use client";

import type { ReactNode } from "react";
import { FlowProvider } from "flow-state/react";
import { deskBrowserSetup } from "./browser-setup.js";

export function DeskProviders({ userId, children }: { userId: string; children: ReactNode }) {
  // A setup is inert data. FlowProvider constructs one Runtime per setup scope, readies it in an
  // effect, and disposes the old one when the scope changes (sign-out or another user).
  return <FlowProvider setup={deskBrowserSetup(userId)}>{children}</FlowProvider>;
}
