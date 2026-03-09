import type { Locale } from "@/core/i18n/i18nStore";

/**
 * Format a date string or Date object respecting locale.
 * - English ("en"): Gregorian calendar
 * - Arabic ("ar"): Hijri (Islamic) calendar with Arabic numerals
 *
 * @param raw   ISO string, "YYYY-MM-DD", "YYYY-MM-DD HH:mm", or Date
 * @param locale Current locale
 * @param opts  Optional: "date" (default), "datetime", "time", "short"
 */
export function formatDate(
  raw: string | Date | null | undefined,
  locale: Locale,
  opts: "date" | "datetime" | "time" | "short" = "date",
): string {
  if (!raw) return "—";

  const d = typeof raw === "string" ? parseDate(raw) : raw;
  if (Number.isNaN(d.getTime())) return "—";

  const cal = locale === "ar" ? "islamic-umalqura" : "gregory";
  const loc = locale === "ar" ? "ar-SA" : "en-US";

  switch (opts) {
    case "short":
      return d.toLocaleDateString(loc, {
        calendar: cal,
        month: "short",
        day: "numeric",
      });

    case "time":
      return d.toLocaleTimeString(loc, {
        hour: "2-digit",
        minute: "2-digit",
      });

    case "datetime":
      return d.toLocaleString(loc, {
        calendar: cal,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

    case "date":
    default:
      return d.toLocaleDateString(loc, {
        calendar: cal,
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  }
}

/** Parse loose date strings: ISO, "YYYY-MM-DD", "YYYY-MM-DD HH:mm" */
function parseDate(raw: string): Date {
  if (!raw) return new Date(NaN);
  if (raw.includes("T")) return new Date(raw);
  if (raw.includes(" ")) return new Date(raw.replace(" ", "T"));
  return new Date(raw + "T00:00:00");
}

/**
 * Format currency amount respecting locale.
 * Uses SAR for Arabic, USD for English.
 */
export function formatCurrency(
  amount: number,
  locale: Locale,
  currency: string = locale === "ar" ? "SAR" : "USD",
): string {
  const loc = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(loc, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
