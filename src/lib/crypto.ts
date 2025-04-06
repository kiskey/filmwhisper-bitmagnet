import { jose } from '../deps.ts';
import type { Config } from '../types.ts'; 

const ADDON_SECRET_KEY_ENV = Deno.env.get('ADDON_SECRET_KEY');
let addonSecretKey: CryptoKey | null = null;

export async function initializeSecretKey(): Promise<boolean> {
    if (addonSecretKey) return true; 
    if (!ADDON_SECRET_KEY_ENV || ADDON_SECRET_KEY_ENV.length < 32) {
        console.error("FATAL: ADDON_SECRET_KEY environment variable is missing or too short.");
        return false;
    }
    try {
        const secretKeyMaterial = new TextEncoder().encode(ADDON_SECRET_KEY_ENV);
        const salt = new TextEncoder().encode("bitmagnet-stremio-salt");
        const derivedKey = await crypto.subtle.importKey("raw", secretKeyMaterial, { name: "PBKDF2" }, false, ["deriveKey"]);
        addonSecretKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            derivedKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
        console.log("Successfully derived encryption key.");
        return true;
    } catch (e) {
        console.error("FATAL: Could not derive encryption key:", e);
        addonSecretKey = null;
        return false;
    }
}

const JWE_ALG = "dir";
const JWE_ENC = "A256GCM";

export async function encryptConfig(config: Config): Promise<string> {
    if (!addonSecretKey) throw new Error("Encryption key is not initialized.");
    const payload: jose.JWTPayload = config as unknown as jose.JWTPayload;
    const jwe = await new jose.EncryptJWT(payload)
        .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
        .setExpirationTime('2y')
        .encrypt(addonSecretKey);
    return jwe;
}

export async function decryptConfig(jwe: string): Promise<Config | null> {
    if (!addonSecretKey) { console.error("Decryption skipped: Key not initialized."); return null; }
    try {
        const { payload } = await jose.jwtDecrypt(jwe, addonSecretKey);
        const parsed = payload as unknown as Partial<Config>;
        if (typeof parsed.bitmagnetUrl !== 'string' || !parsed.bitmagnetUrl) throw new Error("Decrypted config missing 'bitmagnetUrl'");
        // Use hardcoded defaults matching manifest for simplicity here
        const finalConfig: Config = {
            bitmagnetUrl: parsed.bitmagnetUrl,
            tmdbApiKey: parsed.tmdbApiKey || undefined, premiumizeApiKey: parsed.premiumizeApiKey || undefined,
            bitmagnetTimeout: typeof parsed.bitmagnetTimeout === 'number' ? parsed.bitmagnetTimeout : 30,
            bitmagnetSortField: typeof parsed.bitmagnetSortField === 'string' ? parsed.bitmagnetSortField : 'Seeders',
            bitmagnetSortDescending: typeof parsed.bitmagnetSortDescending === 'boolean' ? parsed.bitmagnetSortDescending : true,
            bitmagnetSearchLimit: typeof parsed.bitmagnetSearchLimit === 'number' ? parsed.bitmagnetSearchLimit : 30,
        };
        if (isNaN(finalConfig.bitmagnetTimeout) || finalConfig.bitmagnetTimeout < 5) finalConfig.bitmagnetTimeout = 30;
        if (isNaN(finalConfig.bitmagnetSearchLimit) || finalConfig.bitmagnetSearchLimit < 1 || finalConfig.bitmagnetSearchLimit > 100) finalConfig.bitmagnetSearchLimit = 30;
        return finalConfig;
    } catch (error) {
        console.error(`JWE decryption failed: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof jose.errors.JWTExpired) console.warn("Config token expired.");
        else if (error instanceof jose.errors.JWEDecryptionFailed || error instanceof jose.errors.JWEInvalid) console.warn("JWE decryption failed (key/format).");
        return null;
    }
}

export function isKeyInitialized(): boolean {
    return !!addonSecretKey;
}