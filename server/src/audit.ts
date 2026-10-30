import { db } from "./db.js";

type AuditOutcome = "success" | "failure" | "denied";

type AuditEvent = {
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  outcome: AuditOutcome;
  details?: string | null;
};

export function writeAuditLog(event: AuditEvent): void {
  db.prepare(`
    INSERT INTO audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      outcome,
      details
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.actorUserId,
    event.action,
    event.entityType,
    event.entityId ?? null,
    event.outcome,
    event.details ?? null
  );
}