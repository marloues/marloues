import { beforeEach, describe, expect, it, vi } from "vitest";

const safeStorageMocks = {
  isEncryptionAvailable: vi.fn<() => boolean>(),
  encryptString: vi.fn<(value: string) => Buffer>(),
  decryptString: vi.fn<(value: Buffer) => string>(),
};

import {
  SECRET_ENCRYPTION_UNAVAILABLE_CODE,
  isSecretEncryptionUnavailableError,
} from "../../client/shared/types";
const {
  SecretEncryptionUnavailableError,
  createSecretStorageService,
  isEncryptedSecret,
} = await import("../../client/main/services/secure-storage.service");

const { decryptSecret, encryptSecret, isSecretEncryptionAvailable } =
  createSecretStorageService(safeStorageMocks);

const SAFE_PREFIX = "enc:safe:v1:";

beforeEach(() => {
  safeStorageMocks.isEncryptionAvailable.mockReset();
  safeStorageMocks.encryptString.mockReset();
  safeStorageMocks.decryptString.mockReset();
  safeStorageMocks.isEncryptionAvailable.mockReturnValue(true);
  safeStorageMocks.encryptString.mockImplementation((value) =>
    Buffer.from(`cipher:${value}`, "utf8"),
  );
  safeStorageMocks.decryptString.mockImplementation((value) =>
    value.toString("utf8").replace(/^cipher:/, ""),
  );
});

describe("secure storage", () => {
  it("encrypts and decrypts secrets with safeStorage", () => {
    const encrypted = encryptSecret("sk-live-123");

    expect(encrypted).toMatch(/^enc:safe:v1:/);
    expect(decryptSecret(encrypted)).toBe("sk-live-123");
  });

  it("rejects writes when safeStorage is unavailable with an IPC-recognizable error", () => {
    safeStorageMocks.isEncryptionAvailable.mockReturnValue(false);

    let thrown: unknown;
    try {
      encryptSecret("sk-live-123");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SecretEncryptionUnavailableError);
    expect(thrown).toMatchObject({ code: SECRET_ENCRYPTION_UNAVAILABLE_CODE });
    expect(isSecretEncryptionUnavailableError(thrown)).toBe(true);
    expect(
      isSecretEncryptionUnavailableError(
        `Error invoking remote method: ${String(thrown)}`,
      ),
    ).toBe(true);
    expect(safeStorageMocks.encryptString).not.toHaveBeenCalled();
  });

  it("normalizes availability-check failures to the stable error", () => {
    safeStorageMocks.isEncryptionAvailable.mockImplementation(() => {
      throw new Error("credential service unavailable");
    });

    expect(() => encryptSecret("sk-live-123")).toThrow(
      SecretEncryptionUnavailableError,
    );
    expect(isSecretEncryptionAvailable()).toBe(false);
  });

  it("normalizes encryption failures to the stable error", () => {
    safeStorageMocks.encryptString.mockImplementation(() => {
      throw new Error("credential store locked");
    });

    expect(() => encryptSecret("sk-live-123")).toThrow(
      SecretEncryptionUnavailableError,
    );
  });

  it("keeps an existing safeStorage value without encrypting it again", () => {
    const existing = `${SAFE_PREFIX}${Buffer.from("cipher:sk-existing", "utf8").toString("base64")}`;

    expect(encryptSecret(existing)).toBe(existing);
    expect(decryptSecret(existing)).toBe("sk-existing");
    expect(isEncryptedSecret(existing)).toBe(true);
    expect(safeStorageMocks.encryptString).not.toHaveBeenCalled();
  });
});
