import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PasswordStrengthProps {
  password: string;
  t: (key: string) => string;
}

interface Rule {
  key: string;
  test: (pw: string) => boolean;
}

const RULES: Rule[] = [
  { key: "minLength", test: (pw) => pw.length >= 8 },
  { key: "uppercase", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lowercase", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", test: (pw) => /\d/.test(pw) },
  { key: "special", test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

const STRENGTH_LABELS = ["veryWeak", "weak", "fair", "good", "strong"] as const;
const STRENGTH_COLORS = [
  "bg-destructive",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-blue-500",
  "bg-green-500",
];

export const PasswordStrength = ({ password, t }: PasswordStrengthProps) => {
  const results = useMemo(() => RULES.map((r) => ({ ...r, passed: r.test(password) })), [password]);
  const passedCount = results.filter((r) => r.passed).length;
  const strengthIndex = Math.max(0, passedCount - 1);
  const progressValue = (passedCount / RULES.length) * 100;

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t("auth.passwordStrength")}</span>
          <span className={`text-xs font-medium ${passedCount >= 4 ? "text-green-600 dark:text-green-400" : passedCount >= 3 ? "text-blue-600" : "text-muted-foreground"}`}>
            {t(`auth.strength.${STRENGTH_LABELS[strengthIndex]}`)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${STRENGTH_COLORS[strengthIndex]}`}
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-0.5">
        {results.map((rule) => (
          <li key={rule.key} className="flex items-center gap-1.5 text-xs">
            {rule.passed ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            )}
            <span className={rule.passed ? "text-muted-foreground" : "text-muted-foreground/60"}>
              {t(`auth.pwRule.${rule.key}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
