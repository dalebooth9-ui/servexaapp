export const printLogo = (leaveLogoOff: boolean, logoUrl: string | null) => leaveLogoOff ? null : logoUrl;

export function unprintedStickerKeys(labels: { key: string; printedAt?: string | null }[]) {
  return new Set(labels.filter(l => !l.printedAt).map(l => l.key));
}

export const outletCountUnknown = (count: number | null | undefined) => count == null;