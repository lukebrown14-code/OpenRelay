// DEPRECATED legacy exporter. Kept only so old dashboards keep working during
// migration. New code should NOT route through here.
export function exportV1(cfg) {
  return Object.entries(cfg).map(([k, v]) => `${k}=${v}`).join(";")
}
