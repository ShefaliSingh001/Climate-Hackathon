// A business is verified when it has an ABN on file (11 digits). Listings from the backend may also
// arrive with `verified: true`; either counts.
export const hasAbn = (abn?: string | null) => !!abn && /^\d{11}$/.test(abn.replace(/\s/g, ''));

export const isVerified = (l: { verified?: boolean; abn?: string | null }) => !!l.verified || hasAbn(l.abn);

export const VERIFIED_LABEL = 'Verified business (ABN on file)';
