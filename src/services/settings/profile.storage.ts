import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const AVATAR_BUCKET = "avatars";
const DEFAULT_SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

export const profileStorage = {
  async uploadAvatar(userId: string, file: File) {
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      throw new ServiceError(uploadErr.message ?? "Failed to upload avatar", {
        code: uploadErr.name,
        details: uploadErr,
      });
    }

    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, DEFAULT_SIGNED_URL_TTL);

    if (error || !data?.signedUrl) {
      throw new ServiceError(error?.message ?? "Failed to create signed avatar URL", {
        code: error?.name,
        details: error,
      });
    }

    return { path, signedUrl: data.signedUrl };
  },
  async getSignedAvatarUrl(path: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL) {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new ServiceError(error?.message ?? "Failed to create signed avatar URL", {
        code: error?.name,
        details: error,
      });
    }

    return data.signedUrl;
  },
  async removeAvatar(userId: string) {
    const paths = [
      `${userId}/avatar.jpg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
    ];
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to remove avatar", {
        code: error.name,
        details: error,
      });
    }
  },
};
