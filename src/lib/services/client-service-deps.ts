import { db } from "@/lib/db/client";
import {
  createClient as createClientRecord,
  deleteClientById,
  findClientById,
  findClientBySlug,
  hasInFlightReportForClient,
  listClients as listClientRows,
  recordAuditEntry,
  setClientStatus,
  setProjects as setClientProjects,
  updateClient as updateClientRecord,
} from "@/lib/db/repos";
import type { ClientServiceDeps } from "@/lib/services/clients";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

export const clientServiceDeps: ClientServiceDeps = {
  repo: {
    createClient: createClientRecord,
    deleteClientById,
    findClientById,
    findClientBySlug,
    listClients: listClientRows,
    setClientStatus,
    setProjects: setClientProjects,
    updateClient: updateClientRecord,
  },
  hasInFlightReportsForClient: hasInFlightReportForClient,
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
};
