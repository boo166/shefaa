import { profileStorageRepository } from "./profile.storage.repository";
import { STORAGE_SIGNED_URL_TTLS } from "@/services/storage/signedUrlPolicy";

const DEFAULT_SIGNED_URL_TTL = STORAGE_SIGNED_URL_TTLS.AVATAR;

export const profileStorage = {
  async uploadAvatar(userId: string, file: File) {
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/avatar.${ext}`;

    await profileStorageRepository.upload(path, file);
    const signedUrl = await profileStorageRepository.createSignedUrl(path, DEFAULT_SIGNED_URL_TTL);
    return { path, signedUrl };
  },
  async getSignedAvatarUrl(path: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL) {
    return await profileStorageRepository.createSignedUrl(path, expiresInSeconds);
  },
  async refreshSignedUrl(path: string) {
    return await profileStorageRepository.createSignedUrl(path, DEFAULT_SIGNED_URL_TTL);
  },
  async removeAvatar(userId: string) {
    const paths = [
      `${userId}/avatar.jpg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
    ];
    await profileStorageRepository.remove(paths);
  },
};
