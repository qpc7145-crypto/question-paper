import crypto from "node:crypto";

// Field-level encryption for personal data (CNIC).
//   DATA_ENCRYPTION_KEY: 32 random bytes, base64 (generate with `openssl rand -base64 32`).
// Ciphertext format: "v1:" + base64(iv[12] | authTag[16] | ciphertext), AES-256-GCM.
// The lookup hash is an HMAC-SHA256 with a sub-key derived from the same secret, so equal
// CNICs can be found without decrypting and without the hash being reversible by brute force
// unless the key leaks too.
// Losing the key makes stored CNICs unreadable: keep it with the database backups' secrets.

const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set (32 random bytes, base64: `openssl rand -base64 32`)");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

const subKey = (purpose: string) => Buffer.from(crypto.hkdfSync("sha256", masterKey(), Buffer.alloc(0), purpose, 32));

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", subKey("qpb/field-encryption"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptField(stored: string): string {
  const [version, payload] = stored.split(":");
  if (version !== VERSION || !payload) throw new Error("Unrecognised encrypted value");
  const buf = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", subKey("qpb/field-encryption"), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

// CNICs compare on their digits only ("35202-1234567-8" == "3520212345678").
export const normaliseCnic = (cnic: string) => cnic.replace(/\D/g, "");

export function cnicHash(cnic: string): string {
  return crypto.createHmac("sha256", subKey("qpb/cnic-index")).update(normaliseCnic(cnic)).digest("hex");
}

export const sealCnic = (cnic: string) => ({ cnicEncrypted: encryptField(cnic), cnicHash: cnicHash(cnic) });
