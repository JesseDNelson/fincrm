
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type Role = "admin" | "manager" | "analyst" | "viewer";

type User = {
  id: number;
  username: string;
  role: Role;
};

type Customer = {
  id: number;
  name: string;
  email: string;
  status: "active" | "inactive";
  created_by: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
};

type CustomerForm = {
  name: string;
  email: string;
};

const emptyForm: CustomerForm = { name: "", email: "" };

async function getError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  const canEdit = user?.role !== "viewer";
  const canDeactivate =
    user?.role === "admin" || user?.role === "manager";

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomerError("");

    try {
      const response = await fetch("/api/customers");

      if (!response.ok) {
        throw new Error(await getError(response));
      }

      const data = await response.json();
      setCustomers(data.customers);
    } catch (err) {
      setCustomerError(
        err instanceof Error ? err.message : "Unable to load customers"
      );
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me");

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        }
      } catch {
        // User is not authenticated or API is unavailable.
      } finally {
        setLoading(false);
      }
    }

    void checkSession();
  }, []);

  useEffect(() => {
    if (user) {
      void loadCustomers();
    }
  }, [user, loadCustomers]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? "Invalid username or password."
            : await getError(response)
        );
        return;
      }

      const data = await response.json();
      setUser(data.user);
      setPassword("");
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST"
      });

      if (!response.ok) {
        setError(await getError(response));
        return;
      }

      setUser(null);
      setCustomers([]);
      setUsername("");
      setPassword("");
      setSearch("");
      setFormOpen(false);
      setNotice("");
      setCustomerError("");
    } catch {
      setError("Unable to connect to the server.");
    }
  }

  function openCreateForm() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(customer: Customer) {
    setEditing(customer);
    setForm({ name: customer.name, email: customer.email });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) return;

    setSaving(true);
    setFormError("");
    setNotice("");

    try {
      const url = editing
        ? `/api/customers/${editing.id}`
        : "/api/customers";

      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        throw new Error(await getError(response));
      }

      setNotice(editing ? "Customer updated." : "Customer created.");
      setFormOpen(false);
      setEditing(null);
      await loadCustomers();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to save customer"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(customer: Customer) {
    if (!canDeactivate || deactivatingId !== null) return;

    const confirmed = window.confirm(
      `Deactivate ${customer.name}? This customer will remain in the database.`
    );

    if (!confirmed) return;

    setDeactivatingId(customer.id);
    setCustomerError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/customers/${customer.id}/deactivate`,
        { method: "PATCH" }
      );

      if (!response.ok) {
        throw new Error(await getError(response));
      }

      setNotice(`${customer.name} was deactivated.`);
      await loadCustomers();
    } catch (err) {
      setCustomerError(
        err instanceof Error ? err.message : "Unable to deactivate customer"
      );
    } finally {
      setDeactivatingId(null);
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = search.trim().toLowerCase();

    return (
      customer.name.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query) ||
      customer.status.includes(query)
    );
  });

  const activeCount = customers.filter(
    (customer) => customer.status === "active"
  ).length;

  if (loading) {
    return (
      <main className="app-shell">
        <p>Loading FinCRM...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <section className="login-card">
          <div className="brand-mark">F</div>
          <span className="eyebrow">FINCRM</span>
          <h1>Welcome back</h1>
          <p className="subtitle">
            Sign in to your customer management workspace.
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {error && (
              <p className="error-message" role="alert">{error}</p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="login-footer">
            Authorized access only. Activity may be logged for audit purposes.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">FINCRM</span>
            <h1>Customer Management</h1>
            <p>Secure customer relationship management</p>
          </div>

          <div className="header-actions">
            <span className="user-chip">
              {user.username} · {user.role}
            </span>
            <button
              className="secondary-button"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <p className="error-message" role="alert">{error}</p>
        )}

        <div className="stats-grid">
          <section className="stat-card">
            <span>Total customers</span>
            <strong>{customers.length}</strong>
          </section>
          <section className="stat-card">
            <span>Active customers</span>
            <strong>{activeCount}</strong>
          </section>
          <section className="stat-card">
            <span>Your access level</span>
            <strong className="role-value">{user.role}</strong>
          </section>
        </div>

        <section className="customers-panel">
          <div className="panel-header">
            <div>
              <h2>Customers</h2>
              <p>View and manage customer records</p>
            </div>

            {canEdit && (
              <button
                className="primary-button add-button"
                onClick={openCreateForm}
              >
                + Add Customer
              </button>
            )}
          </div>

          <div className="table-toolbar">
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Search by name, email, or status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="secondary-button"
              onClick={() => void loadCustomers()}
              disabled={customersLoading}
            >
              Refresh
            </button>
          </div>

          {notice && (
            <p className="success-message" role="status">{notice}</p>
          )}

          {customerError && (
            <p className="error-message" role="alert">
              {customerError}
            </p>
          )}

          <div className="table-container">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Updated</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>#{customer.id}</td>
                    <td className="customer-name">{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>
                      <span className={`status-badge ${customer.status}`}>
                        {customer.status}
                      </span>
                    </td>
                    <td>{customer.updated_at}</td>
                    {canEdit && (
                      <td>
                        <div className="row-actions">
                          <button
                            className="text-button"
                            onClick={() => openEditForm(customer)}
                          >
                            Edit
                          </button>
                          {canDeactivate &&
                            customer.status === "active" && (
                              <button
                                className="text-button danger"
                                onClick={() =>
                                  void handleDeactivate(customer)
                                }
                                disabled={deactivatingId !== null}
                              >
                                {deactivatingId === customer.id
                                  ? "Working..."
                                  : "Deactivate"}
                              </button>
                            )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {!customersLoading && filteredCustomers.length === 0 && (
              <div className="empty-state">
                {search
                  ? "No customers match your search."
                  : "No customers yet. Add one to get started."}
              </div>
            )}

            {customersLoading && (
              <div className="empty-state">Loading customers...</div>
            )}
          </div>

          <p className="table-footer">
            Showing {filteredCustomers.length} of {customers.length} customers
          </p>
        </section>

        <p className="audit-note">
          Access permissions are enforced by the server.
          Customer changes and denied actions are recorded in the audit log.
        </p>
      </div>

      {formOpen && (
        <div className="modal-backdrop">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-form-title"
          >
            <div className="modal-header">
              <h2 id="customer-form-title">
                {editing ? "Edit Customer" : "Add Customer"}
              </h2>
              <button
                className="close-button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              <label htmlFor="customer-name">Customer name</label>
              <input
                id="customer-name"
                value={form.name}
                maxLength={200}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />

              <label htmlFor="customer-email">Email address</label>
              <input
                id="customer-email"
                type="email"
                value={form.email}
                maxLength={254}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
              />

              {formError && (
                <p className="error-message" role="alert">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save Changes"
                      : "Create Customer"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
