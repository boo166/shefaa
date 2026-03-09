import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "./translations/en";
import { ar } from "./translations/ar";

export type Locale = "en" | "ar";
export type CalendarType = "gregorian" | "hijri";

type TranslationKeys = typeof en;

const translations: Record<Locale, TranslationKeys> = { en, ar };

interface I18nState {
  locale: Locale;
  dir: "ltr" | "rtl";
  calendarType: CalendarType;
  setLocale: (locale: Locale) => void;
  setCalendarType: (calendarType: CalendarType) => void;
  t: (path: string) => string;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: "en",
      dir: "ltr",
      calendarType: "gregorian",
      setLocale: (locale: Locale) => {
        const dir = locale === "ar" ? "rtl" : "ltr";
        document.documentElement.setAttribute("dir", dir);
        document.documentElement.setAttribute("lang", locale);
        set({ locale, dir });
      },
      setCalendarType: (calendarType: CalendarType) => {
        set({ calendarType });
      },
      t: (path: string) => {
        const { locale } = get();
        const keys = path.split(".");
        let value: any = translations[locale];
        for (const key of keys) {
          value = value?.[key];
        }
        return (value as string) ?? path;
      },
    }),
    {
      name: "medflow-i18n",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const dir = state.locale === "ar" ? "rtl" : "ltr";
          document.documentElement.setAttribute("dir", dir);
          document.documentElement.setAttribute("lang", state.locale);
        }
      },
    }
  )
);
