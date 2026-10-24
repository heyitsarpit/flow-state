// Application domain values, independent of Flow and its hosts.
export type Ticket = {
  workspaceId: string;
  ticketId: string;
  title: string;
};

export type TicketInput = { workspaceId: string; ticketId: string };

export type SaveTitleInput = TicketInput & { title: string; requestId: string };

export type TicketError = { message: string };
