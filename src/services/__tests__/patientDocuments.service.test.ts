import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patientDocumentsService } from "@/services/patients/patientDocuments.service";
import { patientDocumentsRepository } from "@/services/patients/patientDocuments.repository";
import {
  uploadPatientDocument,
  removePatientDocument,
} from "@/services/patients/patientDocuments.storage";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/services/patients/patientDocuments.repository", () => ({
  patientDocumentsRepository: {
    createMetadata: vi.fn(),
    listByPatient: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/services/patients/patientDocuments.storage", () => ({
  uploadPatientDocument: vi.fn(),
  removePatientDocument: vi.fn(),
  downloadPatientDocument: vi.fn(),
}));

const repo = vi.mocked(patientDocumentsRepository, true);
const storageUpload = vi.mocked(uploadPatientDocument, true);
const storageRemove = vi.mocked(removePatientDocument, true);

class FileMock {
  name: string;
  type: string;
  size: number;

  constructor(parts: Array<string | ArrayBuffer>, name: string, options?: { type?: string }) {
    this.name = name;
    this.type = options?.type ?? "";
    this.size = parts.reduce((acc, part) => {
      if (typeof part === "string") return acc + part.length;
      return acc + part.byteLength;
    }, 0);
  }
}

beforeAll(() => {
  (globalThis as unknown as { File?: typeof FileMock }).File = FileMock as unknown as typeof File;
});

describe("patientDocumentsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads document and stores metadata", async () => {
    storageUpload.mockResolvedValue({
      filePath: "00000000-0000-0000-0000-000000000111/patients/p1/doc.pdf",
      fileName: "doc.pdf",
      fileSize: 10,
      fileType: "application/pdf",
    });

    repo.createMetadata.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000009999",
      patient_id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      file_name: "doc.pdf",
      file_path: "00000000-0000-0000-0000-000000000111/patients/p1/doc.pdf",
      file_size: 10,
      file_type: "application/pdf",
      uploaded_by: "00000000-0000-0000-0000-000000000222",
      notes: "note",
      created_at: "2026-03-11T10:00:00Z",
    });

    const file = new FileMock(["content"], "doc.pdf", { type: "application/pdf" }) as unknown as File;
    const result = await patientDocumentsService.upload({
      patient_id: "00000000-0000-0000-0000-000000000333",
      file,
      notes: "note",
    });

    expect(storageUpload).toHaveBeenCalledWith({
      tenantId: "00000000-0000-0000-0000-000000000111",
      patientId: "00000000-0000-0000-0000-000000000333",
      file,
    });
    expect(repo.createMetadata).toHaveBeenCalled();
    expect(result.file_name).toBe("doc.pdf");
  });

  it("cleans up storage if metadata creation fails", async () => {
    storageUpload.mockResolvedValue({
      filePath: "00000000-0000-0000-0000-000000000111/patients/p1/doc.pdf",
      fileName: "doc.pdf",
      fileSize: 10,
      fileType: "application/pdf",
    });
    storageRemove.mockResolvedValue(undefined);
    repo.createMetadata.mockRejectedValue(new Error("db failed"));

    const file = new FileMock(["content"], "doc.pdf", { type: "application/pdf" }) as unknown as File;
    await expect(
      patientDocumentsService.upload({
        patient_id: "00000000-0000-0000-0000-000000000333",
        file,
      }),
    ).rejects.toThrow("db failed");

    expect(storageRemove).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000111/patients/p1/doc.pdf",
    );
  });

  it("returns storage error details when cleanup fails", async () => {
    repo.remove.mockResolvedValue({
      file_path: "00000000-0000-0000-0000-000000000111/patients/p1/doc.pdf",
    });
    storageRemove.mockRejectedValue(new Error("storage failed"));

    const result = await patientDocumentsService.remove("00000000-0000-0000-0000-000000009999");
    expect(result).toEqual({ storageError: "storage failed" });
  });
});
