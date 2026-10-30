
import { Router } from "express";
import { db } from "./db.js";
import { authenticate } from "./middleware/authenticate.js";
import { authorize } from "./middleware/authorize.js";
import { writeAuditLog } from "./audit.js";
import { withTransaction } from "./transaction.js";

export const customersRouter = Router();

function validateCustomerInput(body: unknown):
  | { name: string; email: string }
  | { error: string } {
  const input = body as Record<string, unknown> | null | undefined;
  const name = input?.name;
  const email = input?.email;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    !name.trim() ||
    !email.trim()
  ) {
    return { error: "Customer name and email are required" };
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedName.length > 200 ||
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return { error: "Invalid customer name or email" };
  }

  return {
    name: normalizedName,
    email: normalizedEmail
  };
}

function isValidCustomerId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

function isDuplicateEmailError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  );
}

// GET /api/customers
// All authenticated roles can view customers.
customersRouter.get(
  "/",
  authenticate,
  authorize("admin", "manager", "analyst", "viewer"),
  (_req, res) => {
    const customers = db.prepare(`
      SELECT
        id,
        name,
        email,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM customers
      ORDER BY id DESC
    `).all();

    res.json({ customers });
  }
);

// POST /api/customers
// Admins, managers, and analysts can create customers.
customersRouter.post(
  "/",
  authenticate,
  authorize("admin", "manager", "analyst"),
  (req, res) => {
    const input = validateCustomerInput(req.body);

    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }

    const { name, email } = input;

    try {
      const customerId = withTransaction(() => {
        const result = db.prepare(`
          INSERT INTO customers (
            name,
            email,
            status,
            created_by,
            updated_by
          )
          VALUES (?, ?, 'active', ?, ?)
        `).run(
          name,
          email,
          req.user!.id,
          req.user!.id
        );

        const newId = Number(result.lastInsertRowid);

        writeAuditLog({
          actorUserId: req.user!.id,
          action: "customer.create",
          entityType: "customer",
          entityId: newId,
          outcome: "success",
          details: "Customer record created"
        });

        return newId;
      });

      res.status(201).json({
        customer: {
          id: customerId,
          name,
          email,
          status: "active"
        }
      });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        res.status(409).json({
          error: "A customer with this email already exists"
        });
        return;
      }

      throw error;
    }
  }
);

// PATCH /api/customers/:id
// Admins, managers, and analysts can edit customers.
customersRouter.patch(
  "/:id",
  authenticate,
  authorize("admin", "manager", "analyst"),
  (req, res) => {
    const id = Number(req.params.id);

    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: "Invalid customer ID" });
      return;
    }

    const input = validateCustomerInput(req.body);

    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }

    const { name, email } = input;

    try {
      const updated = withTransaction(() => {
        const result = db.prepare(`
          UPDATE customers
          SET name = ?,
              email = ?,
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          name,
          email,
          req.user!.id,
          id
        );

        if (result.changes === 0) {
          return false;
        }

        writeAuditLog({
          actorUserId: req.user!.id,
          action: "customer.update",
          entityType: "customer",
          entityId: id,
          outcome: "success",
          details: "Customer name or email updated"
        });

        return true;
      });

      if (!updated) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      res.json({
        customer: {
          id,
          name,
          email
        }
      });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        res.status(409).json({
          error: "A customer with this email already exists"
        });
        return;
      }

      throw error;
    }
  }
);

// PATCH /api/customers/:id/deactivate
// Only admins and managers can deactivate customers.
customersRouter.patch(
  "/:id/deactivate",
  authenticate,
  authorize("admin", "manager"),
  (req, res) => {
    const id = Number(req.params.id);

    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: "Invalid customer ID" });
      return;
    }

    const deactivated = withTransaction(() => {
      const result = db.prepare(`
        UPDATE customers
        SET status = 'inactive',
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'active'
      `).run(req.user!.id, id);

      if (result.changes === 0) {
        return false;
      }

      writeAuditLog({
        actorUserId: req.user!.id,
        action: "customer.deactivate",
        entityType: "customer",
        entityId: id,
        outcome: "success",
        details: "Customer deactivated"
      });

      return true;
    });

    if (!deactivated) {
      res.status(404).json({
        error: "Active customer not found"
      });
      return;
    }

    res.json({
      customer: {
        id,
        status: "inactive"
      }
    });
  }
);
