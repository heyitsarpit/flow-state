// STAND-IN for `ticket.domain.ts`'s Ticket entity: only the two writes the feed's `listen` mapping uses. Not part of the trial.
export declare const Ticket: {
  readonly delete: (
    key: { readonly workspaceId: string; readonly ticketId: string },
    options: { readonly version: number },
  ) => unknown;
  readonly patch: (
    key: { readonly workspaceId: string; readonly ticketId: string },
    fields: object,
  ) => unknown;
};
