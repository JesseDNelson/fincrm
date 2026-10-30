import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedUser } from "./authenticate.js";
import { writeAuditLog } from "../audit.js";

type Role = AuthenticatedUser["role"];

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const customerId = Number(req.params.id);

      writeAuditLog({
        actorUserId: req.user.id,
        action: `access.denied.${req.method.toLowerCase()}`,
        entityType: "customer",
        entityId:
          Number.isSafeInteger(customerId) && customerId > 0
            ? customerId
            : null,
        outcome: "denied",
        details: `Role ${req.user.role} denied access to ${req.method} ${req.baseUrl}${req.path}`
      });

      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}