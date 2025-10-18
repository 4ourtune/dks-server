import * as EC from "elliptic";
import * as forge from "node-forge";
import crypto from "crypto";
import CryptoService from "./CryptoService";
import {
  CertificateData,
  VehicleCertificate,
  DigitalKeyCertificate,
  KeyPermissions,
} from "../types";

class ECCCryptoService extends CryptoService {
  private static ec = new EC.ec("p256");

  static generateECKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = this.ec.genKeyPair();

    return {
      publicKey: keyPair.getPublic("hex"),
      privateKey: keyPair.getPrivate("hex"),
    };
  }

  static signWithECDSA(data: string, privateKey: string): string {
    try {
      const key = this.ec.keyFromPrivate(privateKey, "hex");
      const dataHash = crypto.createHash("sha256").update(data).digest();
      const signature = key.sign(dataHash);

      return signature.toDER("hex");
    } catch (error) {
      throw new Error("ECDSA signing failed");
    }
  }

  static verifyECDSASignature(
    data: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      const key = this.ec.keyFromPublic(publicKey, "hex");
      const dataHash = crypto.createHash("sha256").update(data).digest();

      return key.verify(dataHash, signature);
    } catch (error) {
      return false;
    }
  }

  static createVehicleCertificate(
    vehicleId: number,
    deviceSerial: string,
    manufacturer: string,
    model: string,
    vehiclePublicKey: string,
    issuerPrivateKey: string,
    validityDays: number = 365,
  ): VehicleCertificate {
    const serialNumber = this.generateSecureToken(16);
    const now = new Date();
    const validFrom = now.toISOString();
    const validTo = new Date(
      now.getTime() + validityDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const certificate: VehicleCertificate = {
      version: "1.0",
      serialNumber,
      issuer: "DKS Root CA",
      subject: {
        vehicleId,
        deviceSerial,
        manufacturer,
        model,
      },
      publicKey: vehiclePublicKey,
      capabilities: ["unlock", "lock", "startEngine"],
      validFrom,
      validTo,
      signature: "",
    };

    const certificateData = JSON.stringify({
      version: certificate.version,
      serialNumber: certificate.serialNumber,
      issuer: certificate.issuer,
      subject: certificate.subject,
      publicKey: certificate.publicKey,
      capabilities: certificate.capabilities,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
    });

    certificate.signature = this.signWithECDSA(
      certificateData,
      issuerPrivateKey,
    );

    return certificate;
  }

  static createDigitalKeyCertificate(
    userId: number,
    keyId: string,
    permissions: KeyPermissions,
    allowedVehicles: number[],
    userPublicKey: string,
    issuerPrivateKey: string,
    validityDays: number = 90,
  ): DigitalKeyCertificate {
    const serialNumber = this.generateSecureToken(16);
    const now = new Date();
    const validFrom = now.toISOString();
    const validTo = new Date(
      now.getTime() + validityDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const certificate: DigitalKeyCertificate = {
      version: "1.0",
      serialNumber,
      issuer: "DKS Root CA",
      subject: {
        userId,
        keyId,
      },
      publicKey: userPublicKey,
      permissions,
      allowedVehicles,
      validFrom,
      validTo,
      signature: "",
    };

    const certificateData = JSON.stringify({
      version: certificate.version,
      serialNumber: certificate.serialNumber,
      issuer: certificate.issuer,
      subject: certificate.subject,
      publicKey: certificate.publicKey,
      permissions: certificate.permissions,
      allowedVehicles: certificate.allowedVehicles,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
    });

    certificate.signature = this.signWithECDSA(
      certificateData,
      issuerPrivateKey,
    );

    return certificate;
  }

  static verifyCertificate(
    certificate: CertificateData,
    issuerPublicKey: string,
  ): boolean {
    try {
      const { signature, ...certDataWithoutSignature } = certificate;
      const certificateData = JSON.stringify(certDataWithoutSignature);

      const isValidSignature = this.verifyECDSASignature(
        certificateData,
        signature,
        issuerPublicKey,
      );
      if (!isValidSignature) {
        return false;
      }

      const now = new Date();
      const validFrom = new Date(certificate.validFrom);
      const validTo = new Date(certificate.validTo);

      return now >= validFrom && now <= validTo;
    } catch (error) {
      return false;
    }
  }

  static isCertificateExpired(certificate: CertificateData): boolean {
    const now = new Date();
    const validTo = new Date(certificate.validTo);
    return now > validTo;
  }

  static extractPublicKeyFromCertificate(certificate: CertificateData): string {
    return certificate.publicKey;
  }

  static generateCertificateFingerprint(certificate: CertificateData): string {
    const certificateString = JSON.stringify(certificate);
    return this.hashData(certificateString);
  }

  static createCertificateSigningRequest(
    subject: any,
    publicKey: string,
    privateKey: string,
  ): string {
    const csr = {
      subject,
      publicKey,
      timestamp: new Date().toISOString(),
      nonce: this.generateSecureToken(16),
    };

    const csrData = JSON.stringify(csr);
    const signature = this.signWithECDSA(csrData, privateKey);

    return JSON.stringify({
      ...csr,
      signature,
    });
  }

  static verifyCertificateSigningRequest(
    csrString: string,
    publicKey: string,
  ): boolean {
    try {
      const csr = JSON.parse(csrString);
      const { signature, ...csrDataWithoutSignature } = csr;
      const csrData = JSON.stringify(csrDataWithoutSignature);

      return this.verifyECDSASignature(csrData, signature, publicKey);
    } catch (error) {
      return false;
    }
  }

  static generateECDHSharedSecret(
    privateKey: string,
    otherPublicKey: string,
  ): string {
    try {
      const key = this.ec.keyFromPrivate(privateKey, "hex");
      const otherKey = this.ec.keyFromPublic(otherPublicKey, "hex");

      const sharedPoint = key.derive(otherKey.getPublic());
      return sharedPoint.toString("hex");
    } catch (error) {
      throw new Error("ECDH shared secret generation failed");
    }
  }

  static deriveSessionKey(
    sharedSecret: string,
    nonce1: string,
    nonce2: string,
  ): string {
    const combinedData = sharedSecret + nonce1 + nonce2;
    const hash = crypto.createHash("sha256").update(combinedData).digest();
    return hash.toString("hex");
  }

  static encryptWithPublicKey(data: string, publicKey: string): string {
    try {
      const ephemeralKeyPair = this.generateECKeyPair();
      const sharedSecret = this.generateECDHSharedSecret(
        ephemeralKeyPair.privateKey,
        publicKey,
      );

      const sessionKey = crypto
        .createHash("sha256")
        .update(sharedSecret)
        .digest();
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipher("aes-256-cbc", sessionKey);

      let encrypted = cipher.update(data, "utf8", "hex");
      encrypted += cipher.final("hex");

      return JSON.stringify({
        ephemeralPublicKey: ephemeralKeyPair.publicKey,
        iv: iv.toString("hex"),
        encryptedData: encrypted,
      });
    } catch (error) {
      throw new Error("Public key encryption failed");
    }
  }

  static decryptWithPrivateKey(
    encryptedDataString: string,
    privateKey: string,
  ): string {
    try {
      const encryptedData = JSON.parse(encryptedDataString);
      const sharedSecret = this.generateECDHSharedSecret(
        privateKey,
        encryptedData.ephemeralPublicKey,
      );

      const sessionKey = crypto
        .createHash("sha256")
        .update(sharedSecret)
        .digest();

      const decipher = crypto.createDecipher("aes-256-cbc", sessionKey);

      let decrypted = decipher.update(
        encryptedData.encryptedData,
        "hex",
        "utf8",
      );
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error("Private key decryption failed");
    }
  }
}

export default ECCCryptoService;
