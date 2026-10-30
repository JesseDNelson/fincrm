import { Router } from "express";
import { getPostgresPool } from "./postgres.js";
import { withPostgresTransaction } from "./postgres-transaction.js";
import { writePostgresAuditLog } from "./postgres-audit.js";
import { postgresAuthenticate } from "./middleware/postgres-authenticate.js";
import { postgresAuthorize } from "./middleware/postgres-authorize.js";

export const postgresCustomersRouter = Router();

// Every customer endpoint requires a valid PostgreSQL-backed session.
postgresCustomersRouter.use(postgresAuthenticate);

function validateCustomerInput(
  body: unknown
): { name: string; email: string } | { error: string } {
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
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

// GET /api/customers
// All authenticated roles can view customers.
postgresCustomersRouter.get(
  "/",
  postgresAuthorize("admin", "manager", "analyst", "viewer"),
  async (_req, res) => {
    const result = await getPostgresPool().query(`
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
    `);

    res.json({ customers: result.rows });
  }
);

// POST /api/customers
// Admins, managers, and analysts can create customers.
postgresCustomersRouter.post(
  "/",
  postgresAuthorize("admin", "manager", "analyst"),
  async (req, res) => {
    const input = validateCustomerInput(req.body);

    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }

    const actorId = req.user!.id;

    try {
      const customer = await withPostgresTransaction(async (client) => {
        const result = await client.query(
          `
            INSERT INTO customers (
              name,
              email,
              status,
              created_by,
              updated_by
            )
            VALUES ($1, $2, 'active', $3, $3)
            RETURNING id, name, email, status
          `,
          [input.name, input.email, actorId]
        );

        const created = result.rows[0];

        await writePostgresAuditLog(
          {
            actorUserId: actorId,
            action: "customer.create",
            entityType: "customer",
            entityId: created.id,
            outcome: "success",
            details: "Customer record created"
          },
          client
        );

        return created;
      });

      res.status(201).json({ customer });
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
postgresCustomersRouter.patch(
  "/:id",
  postgresAuthorize("admin", "manager", "analyst"),
  async (req, res) => {
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

    const actorId = req.user!.id;

    try {
      const customer = await withPostgresTransaction(async (client) => {
        const result = await client.query(
          `
            UPDATE customers
            SET name = $1,
                email = $2,
                updated_by = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING id, name, email
          `,
          [input.name, input.email, actorId, id]
        );

        if (result.rowCount === 0) {
          return null;
        }

        await writePostgresAuditLog(
          {
            actorUserId: actorId,
            action: "customer.update",
            entityType: "customer",
            entityId: id,
            outcome: "success",
            details: "Customer name or email updated"
          },
          client
        );

        return result.rows[0];
      });

      if (!customer) {
        res.status(404).json({
          error: "Customer not found"
        });
        return;
      }

      res.json({ customer });
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
postgresCustomersRouter.patch(
  "/:id/deactivate",
  postgresAuthorize("admin", "manager"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: "Invalid customer ID" });
      return;
    }

    const actorId = req.user!.id;

    const customer = await withPostgresTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE customers
          SET status = 'inactive',
              updated_by = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
            AND status = 'active'
          RETURNING id, status
        `,
        [actorId, id]
      );

      if (result.rowCount === 0) {
        return null;
      }

      await writePostgresAuditLog(
        {
          actorUserId: actorId,
          action: "customer.deactivate",
          entityType: "customer",
          entityId: id,
          outcome: "success",
          details: "Customer deactivated"
        },
        client
      );

      return result.rows[0];
    });

    if (!customer) {
      res.status(404).json({
        error: "Active customer not found"
      });
      return;
    }

    res.json({ customer });
  }
);
