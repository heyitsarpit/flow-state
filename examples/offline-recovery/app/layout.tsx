import type { ReactNode } from "react";

export default function RootLayout({ children }: Readonly<{ readonly children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
