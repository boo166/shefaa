/** Stable per-tab id (same sessionStorage key as auth orchestration). */
export function getCoordinationTabId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem("shefaa_tab_id");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}`;
      sessionStorage.setItem("shefaa_tab_id", id);
    }
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}
