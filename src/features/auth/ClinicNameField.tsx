import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, Pencil } from "lucide-react";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface ClinicNameFieldProps {
  clinicName: string;
  onClinicNameChange: (name: string) => void;
  onSlugStatusChange: (status: SlugStatus, slug: string) => void;
  t: (key: string) => string;
}

export const ClinicNameField = ({
  clinicName,
  onClinicNameChange,
  onSlugStatusChange,
  t,
}: ClinicNameFieldProps) => {
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugPreview, setSlugPreview] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [customSlug, setCustomSlug] = useState("");
  const [showCustomSlug, setShowCustomSlug] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = useCallback(
    (status: SlugStatus, slug: string) => {
      setSlugStatus(status);
      setSlugPreview(slug);
      onSlugStatusChange(status, slug);
    },
    [onSlugStatusChange],
  );

  const checkSlug = useCallback(
    async (name: string, slug?: string) => {
      if (!slug && name.trim().length < 2) {
        updateStatus("idle", "");
        setSuggestions([]);
        return;
      }

      setSlugStatus("checking");

      try {
        const body: Record<string, string> = {};
        if (slug) {
          body.customSlug = slug;
          body.clinicName = name;
        } else {
          body.clinicName = name.trim();
        }

        const { data, error } = await supabase.functions.invoke("check-slug", { body });

        if (error) {
          updateStatus("idle", "");
          return;
        }

        if (data?.error || !data?.slug) {
          updateStatus("invalid", "");
          setSuggestions([]);
        } else if (data.available) {
          updateStatus("available", data.slug);
          setSuggestions([]);
          setShowCustomSlug(false);
        } else {
          updateStatus("taken", data.slug);
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        updateStatus("idle", "");
      }
    },
    [updateStatus],
  );

  const handleClinicNameChange = (value: string) => {
    onClinicNameChange(value);
    setCustomSlug("");
    setShowCustomSlug(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      updateStatus("idle", "");
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => checkSlug(value), 500);
  };

  const handleCustomSlugChange = (value: string) => {
    // Only allow slug-safe characters
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setCustomSlug(sanitized);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (sanitized.length < 2) {
      updateStatus("idle", "");
      return;
    }
    debounceRef.current = setTimeout(() => checkSlug(clinicName, sanitized), 500);
  };

  const handleSuggestionClick = (slug: string) => {
    setCustomSlug(slug);
    setShowCustomSlug(true);
    updateStatus("available", slug);
    setSuggestions([]);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-2">
      <Label>{t("auth.clinicName")}</Label>
      <Input
        value={clinicName}
        onChange={(e) => handleClinicNameChange(e.target.value)}
        placeholder="My Clinic"
        className={
          slugStatus === "available"
            ? "border-green-500 focus-visible:ring-green-500/30"
            : slugStatus === "taken" || slugStatus === "invalid"
              ? "border-destructive focus-visible:ring-destructive/30"
              : ""
        }
      />

      {/* Status indicator */}
      {clinicName.trim().length >= 2 && (
        <>
          {slugStatus === "checking" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("auth.slugChecking")}
            </div>
          )}

          {slugStatus === "available" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("auth.slugAvailable")}
              </div>
              {slugPreview && (
                <div className="text-xs text-muted-foreground">
                  {t("auth.slugUrl")}{" "}
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                    /tenant/{slugPreview}
                  </span>
                </div>
              )}
            </div>
          )}

          {slugStatus === "taken" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                {t("auth.slugTaken")}
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t("auth.slugSuggestions")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="inline-flex items-center px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-mono text-primary hover:bg-primary/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom slug toggle */}
              {!showCustomSlug && (
                <button
                  type="button"
                  onClick={() => setShowCustomSlug(true)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  {t("auth.slugCustomize")}
                </button>
              )}
            </div>
          )}

          {slugStatus === "invalid" && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              {t("auth.slugInvalid")}
            </div>
          )}
        </>
      )}

      {/* Custom slug input */}
      {showCustomSlug && (
        <div className="space-y-1">
          <Label className="text-xs">{t("auth.slugCustomize")}</Label>
          <Input
            value={customSlug}
            onChange={(e) => handleCustomSlugChange(e.target.value)}
            placeholder={t("auth.slugCustomPlaceholder")}
            className={
              "font-mono text-sm " +
              (slugStatus === "available" && customSlug
                ? "border-green-500 focus-visible:ring-green-500/30"
                : slugStatus === "taken" && customSlug
                  ? "border-destructive focus-visible:ring-destructive/30"
                  : "")
            }
          />
        </div>
      )}
    </div>
  );
};
