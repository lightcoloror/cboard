export interface CareAiRequestScope {
  origin: string;
  accountId: string;
  familyId: string;
  profileId: string;
  fundingId: string;
}
export interface CareAiRequestTicket {
  requestId: string;
  scope: CareAiRequestScope;
  fingerprint: string;
  key: string;
}
export function createCareAiRequestJournal(options: {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}): {
  prepare(input: CareAiRequestScope & { operation: string; body: unknown; localIdentity?: string }): CareAiRequestTicket;
  observe(ticket: CareAiRequestTicket, result?: { status?: number; code?: string }): void;
};
