import i18n from "i18next";
import ICU from "i18next-icu";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { en as legacyEn } from "./translations/en";
import { ar as legacyAr } from "./translations/ar";

export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type Direction = "ltr" | "rtl";
export type CalendarType = "gregorian" | "hijri";

export const TRANSLATION_NAMESPACES = [
  "common",
  "auth",
  "dashboard",
  "patients",
  "appointments",
  "doctors",
  "billing",
  "pharmacy",
  "laboratory",
  "insurance",
  "reports",
  "settings",
  "tutorial",
  "landing",
  "admin",
  "portal",
  "ops",
  "security",
] as const;

export type TranslationNamespace = (typeof TRANSLATION_NAMESPACES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const DEFAULT_NAMESPACE: TranslationNamespace = "common";
const BOOTSTRAP_NAMESPACES: TranslationNamespace[] = ["common", "auth"];
const FONT_LINK_ID = "app-locale-fonts";

const localeModules = import.meta.glob("./locales/*/*.json");
const legacyResources: Record<Locale, Record<string, unknown>> = {
  en: legacyEn,
  ar: legacyAr,
};

const localeMetadata: Record<
  Locale,
  {
    direction: Direction;
    tag: string;
    fontHref: string;
    defaultCalendar: CalendarType;
  }
> = {
  en: {
    direction: "ltr",
    tag: "en-US",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    defaultCalendar: "gregorian",
  },
  ar: {
    direction: "rtl",
    tag: "ar-EG",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap",
    defaultCalendar: "hijri",
  },
};

const activeNamespaces = new Set<TranslationNamespace>(BOOTSTRAP_NAMESPACES);

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function isNamespace(value: string): value is TranslationNamespace {
  return (TRANSLATION_NAMESPACES as readonly string[]).includes(value);
}

function getLegacyNamespace(
  locale: Locale,
  namespace: TranslationNamespace,
): Record<string, unknown> {
  return (legacyResources[locale]?.[namespace] as Record<string, unknown>) ?? {};
}

async function loadNamespaceResource(
  locale: string,
  namespace: string,
): Promise<Record<string, unknown>> {
  if (!isLocale(locale) || !isNamespace(namespace)) {
    return {};
  }

  const legacyNamespace = getLegacyNamespace(locale, namespace);
  const modulePath = `./locales/${locale}/${namespace}.json`;
  const loader = localeModules[modulePath];

  if (loader) {
    const loaded = (await loader()) as { default: Record<string, unknown> };
    return {
      ...legacyNamespace,
      ...loaded.default,
    };
  }

  return legacyNamespace;
}

const initPromise = i18n
  .use(ICU)
  .use(initReactI18next)
  .use(resourcesToBackend(loadNamespaceResource))
  .init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    ns: BOOTSTRAP_NAMESPACES,
    interpolation: {
      escapeValue: false,
    },
    load: "languageOnly",
    react: {
      useSuspense: false,
    },
    returnEmptyString: false,
    returnNull: false,
    supportedLngs: [...SUPPORTED_LOCALES],
  });

function getFontLinkElement() {
  if (typeof document === "undefined") {
    return null;
  }

  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  return link;
}

export function normalizeLocale(raw?: string | null): Locale {
  if (!raw) {
    return DEFAULT_LOCALE;
  }

  const normalized = raw.toLowerCase().split("-")[0];
  return isLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export function getLocaleDirection(locale: Locale): Direction {
  return localeMetadata[locale].direction;
}

export function getDefaultCalendar(locale: Locale): CalendarType {
  return localeMetadata[locale].defaultCalendar;
}

export function getLocaleTag(locale: Locale): string {
  return localeMetadata[locale].tag;
}

export function getIntlLocale(
  locale: Locale,
  calendarType?: CalendarType,
): string {
  const base = getLocaleTag(locale);

  if (!calendarType || calendarType === "gregorian") {
    return base;
  }

  return `${base}-u-ca-islamic-umalqura`;
}

export function syncDocumentLanguage(locale: Locale) {
  if (typeof document === "undefined") {
    return;
  }

  const { direction, fontHref, tag } = localeMetadata[locale];
  document.documentElement.lang = tag;
  document.documentElement.dir = direction;
  document.documentElement.dataset.locale = locale;
  document.documentElement.dataset.font = locale === "ar" ? "arabic" : "latin";

  const fontLink = getFontLinkElement();
  if (fontLink && fontLink.href !== fontHref) {
    fontLink.href = fontHref;
  }
}

export async function ensureNamespaces(
  namespaces: readonly TranslationNamespace[] = [],
) {
  await initPromise;

  const unique = Array.from(
    new Set(
      [DEFAULT_NAMESPACE, ...namespaces].filter(
        (value): value is TranslationNamespace => isNamespace(value),
      ),
    ),
  );

  unique.forEach((namespace) => activeNamespaces.add(namespace));
  await i18n.loadNamespaces(unique);
}

export function getLoadedNamespaces(): TranslationNamespace[] {
  return Array.from(activeNamespaces);
}

export function splitTranslationKey(path: string): {
  namespace: TranslationNamespace;
  key: string;
} {
  const [candidateNamespace, ...segments] = path.split(".");

  if (isNamespace(candidateNamespace) && segments.length > 0) {
    return {
      namespace: candidateNamespace,
      key: segments.join("."),
    };
  }

  return {
    namespace: DEFAULT_NAMESPACE,
    key: path,
  };
}

export function translatePath(
  path: string,
  options?: Record<string, unknown>,
): string {
  const { namespace, key } = splitTranslationKey(path);
  return i18n.t(key, {
    ns: namespace,
    defaultValue: path,
    ...options,
  }) as string;
}

export async function initializeI18n(locale: Locale = DEFAULT_LOCALE) {
  await initPromise;
  await ensureNamespaces(BOOTSTRAP_NAMESPACES);
  await i18n.changeLanguage(locale);
  syncDocumentLanguage(locale);
}

export { i18n };
