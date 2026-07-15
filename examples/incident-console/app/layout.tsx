import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "Incident Console",
  description: "Flow State experimental alpha flagship",
};

export default function Layout({ children }: Readonly<{ readonly children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-muted/30 antialiased">{children}</body>
    </html>
  );
}
