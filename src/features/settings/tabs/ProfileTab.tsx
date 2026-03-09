import { useState, useRef } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Camera, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export const ProfileTab = () => {
  const { t } = useI18n();
  const { user, setUser, supabaseUser } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDemo) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("settings.avatarTooLarge"), variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast({ title: t("common.error"), description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("user_id", user.id);

    if (updateErr) {
      toast({ title: t("common.error"), description: updateErr.message, variant: "destructive" });
    } else {
      setUser({ ...user, avatar: avatarUrl }, supabaseUser);
      toast({ title: t("settings.avatarUpdated") });
    }
    setUploading(false);
  };

  const handleRemoveAvatar = async () => {
    if (!user || isDemo) return;
    setUploading(true);

    // Try removing from storage (may not exist)
    await supabase.storage.from("avatars").remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`]);

    await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    setUser({ ...user, avatar: undefined }, supabaseUser);
    toast({ title: t("settings.avatarRemoved") });
    setUploading(false);
  };

  const handleSaveName = async () => {
    if (!user || isDemo) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      setUser({ ...user, name: fullName }, supabaseUser);
      toast({ title: t("common.saved") });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg">{t("settings.profile")}</h3>

      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary">
              {user?.name?.charAt(0) ?? "?"}
            </AvatarFallback>
          </Avatar>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-full">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || isDemo}
            >
              <Camera className="h-4 w-4" />
              {t("settings.uploadAvatar")}
            </Button>
            {user?.avatar && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveAvatar}
                disabled={uploading || isDemo}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.avatarHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2 max-w-sm">
        <Label>{t("auth.fullName")}</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="text-sm text-muted-foreground">
        {t("common.email")}: {user?.email}
      </div>

      <Button onClick={handleSaveName} disabled={saving || isDemo}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("common.save")}
      </Button>
    </div>
  );
};
