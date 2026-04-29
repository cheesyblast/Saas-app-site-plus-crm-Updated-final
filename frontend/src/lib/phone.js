// Sri Lanka phone normalisation: turns "0777208449" / "777208449" / "+94777208449"
// into the E.164 form "+94777208449" so SMS gateways accept it without errors.
export function normalizePhoneLK(raw) {
  if (!raw) return raw;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+94")) return digits;
  if (digits.startsWith("94")) return `+${digits}`;
  if (digits.startsWith("0")) return `+94${digits.slice(1)}`;
  if (/^[1-9]\d{8}$/.test(digits)) return `+94${digits}`;
  return digits.startsWith("+") ? digits : digits;
}
