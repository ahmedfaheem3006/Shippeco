/**
 * The Backend's DHL shipment role map (services/dhlShipment/shipmentPermissions.ts).
 * Only hides what a role cannot do — the Backend re-checks every call.
 * Kept dependency-free so the sidebar can use it without the wizard code.
 */
const ALL = ['view', 'create_draft', 'edit_draft', 'validate', 'price', 'confirm', 'create', 'download_documents', 'resolve_uncertain', 'retry_invoice', 'pickup',
  'contacts_read', 'contacts_write', 'contacts_manage', 'copy', 'replace', 'cancel_shipment'];
const ROLE_PERMS: Record<string, string[]> = {
  admin: ALL,
  manager: ALL,
  // saved contacts: read + add (an employee edits only the contacts they saved)
  employee: ['view', 'create_draft', 'edit_draft', 'validate', 'price', 'confirm', 'download_documents', 'pickup', 'contacts_read', 'contacts_write', 'copy'],
  accountant: ['view', 'price', 'download_documents', 'retry_invoice'],
  viewer: ['view'],
};
export type ShipmentPermission =
  | 'view' | 'create_draft' | 'edit_draft' | 'validate' | 'price' | 'confirm' | 'create' | 'download_documents' | 'resolve_uncertain' | 'retry_invoice' | 'pickup'
  | 'contacts_read' | 'contacts_write' | 'contacts_manage' | 'copy' | 'replace' | 'cancel_shipment';
export const canShipment = (role: string | undefined | null, p: ShipmentPermission) => (ROLE_PERMS[String(role ?? '').toLowerCase()] ?? []).includes(p);
