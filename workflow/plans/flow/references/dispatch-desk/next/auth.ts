import "server-only";

// Replace with the host's authenticated session lookup. Never accept the principal or token
// from route params. The token stays in server-only modules and never enters a Flow payload.
export async function currentUser(): Promise<{ id: string; token: string }> {
  throw new Error("Install the host authentication adapter before running Dispatch Desk");
}
