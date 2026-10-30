import type { PoolClient } from "pg";
import { getPostgresPool } from "./postgres.js";

type AuditOutcome = "success" | "failure" | "denied";

type AuditEvent = {
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  outcome: AuditOutcome;
  details?: string | null;
};

export async function writePostgresAuditLog(
  event: AuditEvent,
  client?: PoolClient
): Promise<void> {
  const query = `
    INSERT INTO audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      outcome,
      details
    )
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

  const values = [
    event.actorUserId,
    event.action,
    event.entityType,
    event.entityId ?? null,
    event.outcome,
    event.details ?? null
  ];

  if (client) {
    // Use the caller's transaction connection.
    await client.query(query, values);
  } else {
    // For independent events such as failed login attempts.
    await getPostgresPool().query(query, values);
  }
}
