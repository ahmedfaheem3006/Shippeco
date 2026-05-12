import type { PieceInput } from './calculator'
import { toKg } from './chargeableWeight'

export type SurchargeId = 
  | 'elevated_risk' 
  | 'restricted_dest' 
  | 'overweight' 
  | 'oversize' 
  | 'non_conveyable' 
  | 'non_stackable' 
  | 'remote_delivery' 
  | 'remote_pickup';

export type SurchargeDef = {
  id: SurchargeId;
  name: string;
  nameAr: string;
  desc: string;
  feeBase: number;
  perPiece: boolean;
  type: 'auto' | 'manual';
}

const ELEVATED_RISK_COUNTRIES = ['Afghanistan','Burkina Faso','Congo, DPR','Haiti','Iraq','Lebanon','Libya','Mali','Somalia','Sudan','Syria','Ukraine','Venezuela','Yemen'];
const RESTRICTED_DEST_COUNTRIES = ['Central African Rep','Congo, DPR','Iran','Iraq','Korea, D.P.R Of','Libya','Somalia','Yemen'];

export const SURCHARGE_DEFS: SurchargeDef[] = [
  {
    id: 'elevated_risk',
    name: 'Elevated Risk',
    nameAr: 'مناطق خطرة',
    desc: 'رسوم المناطق ذات المخاطر المرتفعة',
    feeBase: 159.0,
    perPiece: false,
    type: 'auto',
  },
  {
    id: 'restricted_dest',
    name: 'Restricted Destination',
    nameAr: 'وجهة محظورة',
    desc: 'رسوم الوجهات المقيدة',
    feeBase: 159.0,
    perPiece: false,
    type: 'auto',
  },
  {
    id: 'overweight',
    name: 'Overweight Piece',
    nameAr: 'طرد ثقيل الوزن',
    desc: 'تنطبق على كل طرد وزنه الفعلي 70 كجم أو أكثر',
    feeBase: 418,
    perPiece: true,
    type: 'auto',
  },
  {
    id: 'oversize',
    name: 'Oversize Piece',
    nameAr: 'طرد كبير الحجم',
    desc: 'تنطبق على كل طرد أحد أبعاده أكثر من 120 سم', // The user's prompt says 100cm, wait, let me check the user's prompt.
    // user's prompt: 'تنطبق على كل طرد أحد أبعاده أكثر من 100 سم'
    feeBase: 88,
    perPiece: true,
    type: 'auto',
  },
  {
    id: 'non_conveyable',
    name: 'Non-Conveyable Piece',
    nameAr: 'طرد غير قابل للنقل الآلي',
    desc: 'تنطبق على كل طرد وزنه الفعلي بين 25 و 70 كجم',
    feeBase: 88,
    perPiece: true,
    type: 'auto',
  },
  {
    id: 'non_stackable',
    name: 'Non-Stackable Pallet',
    nameAr: 'طبلية غير قابلة للتكديس',
    desc: 'شحنات على الطبلية',
    feeBase: 1283.85,
    perPiece: false,
    type: 'manual'
  },
  {
    id: 'remote_delivery',
    name: 'Remote Area Delivery',
    nameAr: 'التوصيل لمنطقة نائية',
    desc: 'رسوم التوصيل لمناطق نائية',
    feeBase: 105.6,
    perPiece: false,
    type: 'manual'
  },
  {
    id: 'remote_pickup',
    name: 'Remote Area Pickup',
    nameAr: 'الاستلام من منطقة نائية',
    desc: 'رسوم الاستلام من مناطق نائية',
    feeBase: 105.6,
    perPiece: false,
    type: 'manual'
  }
];

export function computeAutoSurcharges(
  foreignCountry: string,
  pieces: PieceInput[],
  dimUnit: 'metric' | 'imperial'
) {
  let owCount = 0;
  let osCount = 0;
  let ncCount = 0;

  pieces.forEach(p => {
    const qty = Math.max(1, parseInt(p.qty as any) || 1);
    const actualWKg = toKg(parseFloat(p.weight as any) || 0, dimUnit);
    
    // convert dimensions to cm
    const l = parseFloat(p.l as any) || 0;
    const w = parseFloat(p.w as any) || 0;
    const h = parseFloat(p.h as any) || 0;
    const lCm = dimUnit === 'imperial' ? l * 2.54 : l;
    const wCm = dimUnit === 'imperial' ? w * 2.54 : w;
    const hCm = dimUnit === 'imperial' ? h * 2.54 : h;

    for (let i = 0; i < qty; i++) {
      if (actualWKg >= 70) owCount++;
      if (actualWKg > 25 && actualWKg < 70) ncCount++;
      // user's HTML says oversize is > 100 cm
      if (lCm > 100 || wCm > 100 || hCm > 100) osCount++;
    }
  });

  const isElevatedRisk = ELEVATED_RISK_COUNTRIES.includes(foreignCountry);
  const isRestrictedDest = RESTRICTED_DEST_COUNTRIES.includes(foreignCountry);

  const autoState: Record<SurchargeId, boolean> = {
    elevated_risk: isElevatedRisk,
    restricted_dest: isRestrictedDest,
    overweight: owCount > 0,
    oversize: osCount > 0,
    non_conveyable: ncCount > 0,
    non_stackable: false,
    remote_delivery: false,
    remote_pickup: false
  };

  const counts = {
    overweight: owCount,
    oversize: osCount,
    non_conveyable: ncCount
  };

  return { autoState, counts };
}
