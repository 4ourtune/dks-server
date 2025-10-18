import crypto from "crypto";

class CryptoService {
  private static algorithm = "aes-256-cbc";
  private static keyLength = 32;
  private static ivLength = 16;

  static generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString("hex");
  }

  static generateIV(): Buffer {
    return crypto.randomBytes(this.ivLength);
  }

  static encrypt(
    data: string,
    key: string,
  ): {
    encryptedData: string;
    iv: string;
    tag: string;
  } {
    try {
      // Convert key to proper 32-byte buffer, padding if necessary
      let keyBuffer: Buffer;
      if (key.length === 64) {
        // Assume it's already hex
        keyBuffer = Buffer.from(key, "hex");
      } else {
        // Hash the key to get consistent 32-byte key
        keyBuffer = crypto.createHash("sha256").update(key).digest();
      }

      const iv = this.generateIV();

      const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);

      let encrypted = cipher.update(data, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        encryptedData: encrypted,
        iv: iv.toString("hex"),
        tag: crypto
          .createHash("sha256")
          .update(encrypted + iv.toString("hex"))
          .digest("hex"),
      };
    } catch (error) {
      throw new Error("Encryption failed");
    }
  }

  static decrypt(
    encryptedData: string,
    key: string,
    iv: string,
    tag: string,
  ): string {
    try {
      // Convert key to proper 32-byte buffer, same as encrypt
      let keyBuffer: Buffer;
      if (key.length === 64) {
        // Assume it's already hex
        keyBuffer = Buffer.from(key, "hex");
      } else {
        // Hash the key to get consistent 32-byte key
        keyBuffer = crypto.createHash("sha256").update(key).digest();
      }

      if (tag) {
        const expectedTag = crypto
          .createHash("sha256")
          .update(encryptedData + iv)
          .digest("hex");
        if (expectedTag !== tag) {
          throw new Error("Invalid tag");
        }
      }

      const ivBuffer = Buffer.from(iv, "hex");
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        keyBuffer,
        ivBuffer,
      );

      let decrypted = decipher.update(encryptedData, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error("Decryption failed");
    }
  }

  static hashData(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  static generateDigitalKeyData(
    vehicleId: number,
    userId: number,
    permissions: any,
  ): string {
    const keyData = {
      vehicleId,
      userId,
      permissions,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString("hex"),
    };

    return JSON.stringify(keyData);
  }

  static verifyDigitalKeyData(
    encryptedKeyData: string,
    masterKey: string,
    iv: string,
    tag: string,
  ): {
    vehicleId: number;
    userId: number;
    permissions: any;
    timestamp: number;
  } | null {
    try {
      const decryptedData = this.decrypt(encryptedKeyData, masterKey, iv, tag);
      const keyData = JSON.parse(decryptedData);

      const requiredFields = [
        "vehicleId",
        "userId",
        "permissions",
        "timestamp",
        "nonce",
      ];
      if (!requiredFields.every((field) => field in keyData)) {
        return null;
      }

      return keyData;
    } catch (error) {
      return null;
    }
  }

  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  static createHMAC(data: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  static verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );
  }

  static deriveKeyFromPassword(
    password: string,
    salt: string,
    iterations: number = 100000,
  ): string {
    return crypto
      .pbkdf2Sync(password, salt, iterations, this.keyLength, "sha256")
      .toString("hex");
  }

  static generateSalt(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  static encryptKeyWithMasterKey(keyData: string): {
    encryptedKey: string;
    iv: string;
    tag: string;
    masterKey: string;
  } {
    const masterKey = this.generateKey();
    const encrypted = this.encrypt(keyData, masterKey);

    return {
      encryptedKey: encrypted.encryptedData,
      iv: encrypted.iv,
      tag: encrypted.tag,
      masterKey,
    };
  }

  static validateKeyIntegrity(keyData: string, expectedHash: string): boolean {
    const actualHash = this.hashData(keyData);
    return crypto.timingSafeEqual(
      Buffer.from(actualHash, "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  }

  static generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    return { publicKey, privateKey };
  }

  static signData(data: string, privateKey: string): string {
    const sign = crypto.createSign("sha256");
    sign.update(data);
    return sign.sign(privateKey, "hex");
  }

  static verifySignature(
    data: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      const verify = crypto.createVerify("sha256");
      verify.update(data);
      return verify.verify(publicKey, signature, "hex");
    } catch (error) {
      return false;
    }
  }
}

export default CryptoService;
