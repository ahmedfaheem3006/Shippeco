/** Actions on a created DHL shipment: the complete documents bundle and «Copy» (a new draft). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { dhlShipmentService } from '../../services/dhlShipment.service';
import { downloadBlob, printBlob } from '../../utils/download';
import { describeApiError } from '../../utils/apiErrors';
import { useCsLang } from './csLang';

/** «Download Documents» / «Reprint Documents»: the ONE complete PDF the Backend builds from DHL's originals. */
export function useDocumentsBundle(shipmentId: number) {
  const { t } = useCsLang();
  const [busy, setBusy] = useState<null | 'download' | 'print'>(null);
  const run = async (kind: 'download' | 'print'): Promise<boolean> => {
    if (busy) return false;
    setBusy(kind);
    try {
      const { blob, filename } = await dhlShipmentService.downloadBundle(shipmentId);
      if (kind === 'download') downloadBlob(filename, blob); else printBlob(blob);
      return true;
    } catch (e) {
      toast.error(describeApiError(e, t('تعذر تجهيز مستندات DHL', 'Could not prepare the DHL documents')));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, download: () => run('download'), print: () => run('print') };
}

/** «Copy»: a NEW draft from the business input → the wizard with everything filled (never DHL's output). */
export function useCopyShipment() {
  const { t } = useCsLang();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const copy = async (id: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await dhlShipmentService.copy(id);
      toast.success(t('أُنشئت مسودة جديدة من الشحنة — راجع الخدمة والسعر ثم أنشئها', 'A new draft was made from the shipment — review the service and price, then create it'));
      navigate(`/create-shipment?draft=${d.id}`);
    } catch (e) {
      toast.error(describeApiError(e, t('تعذر نسخ الشحنة', 'Could not copy the shipment')));
    } finally {
      setBusy(false);
    }
  };
  return { busy, copy };
}

