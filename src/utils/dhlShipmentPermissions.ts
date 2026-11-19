/**
 * The Backend's DHL shipment role map (services/dhlShipment/shipmentPermissions.ts).
 * Only hides what a role cannot do — the Backend re-checks every call.
 * Kept dependency-free so the sidebar can use it without the wizard code.
 */
const ROLE_PERMS: Record<string, string[]> = {
  admin: ['view', 'create_draft', 'edit_draft', 'validate', 'price', 'confirm', 'create', 'download_documents', 'resolve_uncertain', 'retry_invoice', 'pickup'],
  manager: ['view', 'create_draft', 'edit_draft', 'validate', 'price', 'confirm', 'create', 'download_documents', 'resolve_uncertain', 'retry_invoice', 'pickup'],
  employee: ['view', 'create_draft', 'edit_draft', 'validate', 'price', 'confirm', 'download_documents', 'pickup'],
  accountant: ['view', 'price', 'download_documents', 'retry_invoice'],
  viewer: ['view'],
};
export type ShipmentPermission =
  | 'view' | 'create_draft' | 'edit_draft' | 'validate' | 'price' | 'confirm' | 'create' | 'download_documents' | 'resolve_uncertain' | 'retry_invoice' | 'pickup';
export const canShipment = (role: string | undefined | null, p: ShipmentPermission) => (ROLE_PERMS[String(role ?? '').toLowerCase()] ?? []).includes(p);
