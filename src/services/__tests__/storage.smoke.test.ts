import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/services/supabase/errors";

const patientDocumentsStorageRepository = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

const profileStorageRepository = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/services/patients/patientDocuments.storage.repository", () => ({
  patientDocumentsStorageRepository,
}));

vi.mock("@/services/settings/profile.storage.repository", () => ({
  profileStorageRepository,
}));

import {
  downloadPatientDocument,
  removePatientDocument,
  uploadPatientDocument,
} from "@/services/patients/patientDocuments.storage";
import { profileStorage } from "@/services/settings/profile.storage";
import { STORAGE_SIGNED_URL_TTLS } from "@/services/storage/signedUrlPolicy";

const tenantId = "00000000-0000-0000-0000-000000000111";
const patientId = "00000000-0000-0000-0000-000000000222";

describe("storage helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientDocumentsStorageRepository.upload.mockResolvedValue(undefined);
    patientDocumentsStorageRepository.download.mockResolvedValue(new Blob(["test"]));
    patientDocumentsStorageRepository.remove.mockResolvedValue(undefined);
    profileStorageRepository.upload.mockResolvedValue(undefined);
    profileStorageRepository.createSignedUrl.mockResolvedValue("https://example.com/avatar.png");
    profileStorageRepository.remove.mockResolvedValue(undefined);
  });

  it("uploads patient documents with a safe tenant path", async () => {
    const file = new File(["doc"], "report 2026/03.pdf", { type: "application/pdf" });
    const result = await uploadPatientDocument({ tenantId, patientId, file });
    expect(result.filePath.startsWith(`${tenantId}/patients/${patientId}/`)).toBe(true);
  });

  it("rejects tenant-mismatched document paths", async () => {
    await expect(downloadPatientDocument(tenantId, "other-tenant/file.pdf")).rejects.toBeInstanceOf(ServiceError);
    await expect(removePatientDocument(tenantId, "other-tenant/file.pdf")).rejects.toBeInstanceOf(ServiceError);
  });

  it("handles profile avatar storage helpers", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const uploaded = await profileStorage.uploadAvatar("user-1", file);
    expect(uploaded.signedUrl).toContain("https://");
    expect(profileStorageRepository.createSignedUrl).toHaveBeenCalledWith(
      "user-1/avatar.png",
      STORAGE_SIGNED_URL_TTLS.AVATAR,
    );
    await profileStorage.getSignedAvatarUrl("user-1/avatar.png", 120);
    await profileStorage.refreshSignedUrl("user-1/avatar.png");
    expect(profileStorageRepository.createSignedUrl).toHaveBeenLastCalledWith(
      "user-1/avatar.png",
      STORAGE_SIGNED_URL_TTLS.AVATAR,
    );
    await profileStorage.removeAvatar("user-1");
  });
});
