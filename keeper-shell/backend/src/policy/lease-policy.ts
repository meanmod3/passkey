// Centralized lease policy. All request/approval/extension logic enforces these caps.
export const LeasePolicy = {
  maxDurationMinutes: 480,       // 8-hour hard cap on any single lease
  defaultDurationMinutes: 30,
  renewalWindowMinutes: 5,       // renewal prompt fires this many minutes before expiry
  maxExtensionMinutes: 240,      // 4-hour max extension per request
  maxExtensionsPerLease: 3,
  requireApprovalForExtension: true,
} as const;

export type LeasePolicyShape = typeof LeasePolicy;

export function clampDuration(requested: number): number {
  if (requested <= 0) return LeasePolicy.defaultDurationMinutes;
  return Math.min(requested, LeasePolicy.maxDurationMinutes);
}

export function clampExtension(requested: number): number {
  if (requested <= 0) return LeasePolicy.defaultDurationMinutes;
  return Math.min(requested, LeasePolicy.maxExtensionMinutes);
}
