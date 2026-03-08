import { useI18n, Locale } from "@/core/i18n/i18nStore";
import { Globe } from "lucide-react";

export const LanguageSwitcher = () => {
  const { locale, setLocale, t } = useI18n();

  const toggle = () => {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
    >
      <Globe className="h-4 w-4" />
      {locale === "en" ? t("common.arabic") : t("common.english")}
    </button>
  );
};
