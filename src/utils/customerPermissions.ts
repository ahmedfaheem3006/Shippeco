/**
 * Who may create a customer — the Backend's rule for POST /clients
 * (routes/clients.routes.ts: requireRole('admin', 'accountant')).
 * Only hides the quick-add button; the Backend re-checks every request.
 */
const CREATE_CUSTOMER_ROLES = ['admin', 'accountant']

export const canCreateCustomer = (role: string | null | undefined) =>
  CREATE_CUSTOMER_ROLES.includes(String(role ?? '').toLowerCase().trim())
