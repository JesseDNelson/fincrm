import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedUser } from "./authenticate.js";
import { writePostgresAuditLog } from "../postgres-audit.js";

type Role = AuthenticatedUser["role"];

export function postgresAuthorize(...allowedRoles: Role[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required"
      });
      return;
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    const customerId = Number(req.params.id);

    try {
      await writePostgresAuditLog({
        actorUserId: req.user.id,
        action: `access.denied.${req.method.toLowerCase()}`,
        entityType: "customer",
        entityId:
          Number.isSafeInteger(customerId) && customerId > 0
            ? customerId
            : null,
        outcome: "denied",
        details:
          `Role ${req.user.role} denied access to ` +
          `${req.method} ${req.baseUrl}${req.path}`
      });

      res.status(403).json({
        error: "Insufficient permissions"
      });
    } catch (error) {
      // Never grant access when audit logging fails.
      // Return a server error rather than silently losing
      // the record of a denied request.
      next(error);
    }
  };
}
