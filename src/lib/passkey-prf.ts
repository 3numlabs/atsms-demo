const SALT_PREFIX = "atsms-p256-key-v1";
const HKDF_INFO = "atsms-p256-private-key-v1";

export const IS_LOCALHOST =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "[::1]";

function getPasskeyRpId(): string {
  return window.location.hostname;
}

// P-256 curve order
const P256_ORDER = BigInt(
  "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
);

const CREDENTIAL_ID_KEY = "atsms_credential_id";
const DID_KEY = "atsms_did";
const HANDLE_KEY = "atsms_handle";
const CERT_PEM_KEY = "atsms_cert_pem";
const CERT_SERIAL_KEY = "atsms_cert_serial";

export function getStoredCredentialId(): string | null {
  return localStorage.getItem(CREDENTIAL_ID_KEY);
}

export function getStoredDid(): string | null {
  return localStorage.getItem(DID_KEY);
}

export function getStoredHandle(): string | null {
  return localStorage.getItem(HANDLE_KEY);
}

export function getStoredCertPEM(): string | null {
  return localStorage.getItem(CERT_PEM_KEY);
}

export function getStoredCertSerial(): string | null {
  return localStorage.getItem(CERT_SERIAL_KEY);
}

export function storeUserData(
  did: string,
  handle: string,
  certPEM: string,
  certSerial: string,
  credentialId: string,
) {
  localStorage.setItem(DID_KEY, did);
  localStorage.setItem(HANDLE_KEY, handle);
  localStorage.setItem(CERT_PEM_KEY, certPEM);
  localStorage.setItem(CERT_SERIAL_KEY, certSerial);
  localStorage.setItem(CREDENTIAL_ID_KEY, credentialId);
}

export function clearStoredData() {
  localStorage.removeItem(DID_KEY);
  localStorage.removeItem(HANDLE_KEY);
  localStorage.removeItem(CERT_PEM_KEY);
  localStorage.removeItem(CERT_SERIAL_KEY);
  localStorage.removeItem(CREDENTIAL_ID_KEY);
}

export async function checkPRFSupport(): Promise<boolean> {
  if (
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    return false;
  }

  // Check via getClientCapabilities if available
  if ("getClientCapabilities" in PublicKeyCredential) {
    try {
      const caps = await (
        PublicKeyCredential as any
      ).getClientCapabilities();
      if (caps?.prf !== undefined) {
        return caps.prf === true;
      }
    } catch {
      // Fall through to alternative check
    }
  }

  // If we can't determine definitively, we'll attempt during registration
  // and check the extension output
  return true;
}

async function computeSalt(did: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT_PREFIX + did);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) {
    str += String.fromCharCode(b);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// How much we ask of create(), most to least. Some WebKit builds (iOS Safari,
// every iOS browser) throw DataError ("Data provided to an operation does not
// meet requirements") when the prf extension carries an eval at registration,
// even though they can evaluate PRF in a later assertion. Persisted so that if
// a create() attempt consumes the user gesture before we can retry, the next
// tap starts on the rung that works on this browser.
type PrfCreateMode = "eval" | "enable" | "bare";
const PRF_CREATE_MODE_KEY = "atsms_prf_create_mode";
const PRF_MODES: PrfCreateMode[] = ["eval", "enable", "bare"];

function prfCreateExtensions(mode: PrfCreateMode, salt: Uint8Array): object | undefined {
  if (mode === "eval") return { prf: { eval: { first: salt } } };
  if (mode === "enable") return { prf: {} };
  return undefined; // bare — no extension; derivation happens in the assertion
}

function isDataError(e: unknown): boolean {
  return e instanceof DOMException &&
    (e.name === "DataError" || e.name === "NotSupportedError");
}

async function createCredential(
  did: string,
  salt: Uint8Array,
  mode: PrfCreateMode,
): Promise<PublicKeyCredential> {
  return (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        name: "ATSMS",
        id: getPasskeyRpId(),
      },
      user: {
        id: new TextEncoder().encode(did),
        name: did,
        displayName: "ATSMS User",
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      extensions: prfCreateExtensions(mode, salt) as any,
    },
  })) as PublicKeyCredential;
}

export async function registerPasskey(
  did: string,
): Promise<{ credentialId: string; prfOutput: ArrayBuffer }> {
  const salt = await computeSalt(did);

  // Start from the rung this browser last succeeded past (or the top).
  const startMode =
    (localStorage.getItem(PRF_CREATE_MODE_KEY) as PrfCreateMode | null) ?? "eval";
  let credential: PublicKeyCredential | null = null;
  let mode = startMode;

  for (const m of PRF_MODES.slice(PRF_MODES.indexOf(startMode))) {
    mode = m;
    try {
      credential = await createCredential(did, salt, m);
      break;
    } catch (e) {
      if (isDataError(e) && m !== "bare") {
        // This create() never reached an authenticator, so no credential was
        // made — safe to retry one rung down. Remember the rung in case the
        // retry loses the user gesture and the user has to tap again.
        localStorage.setItem(PRF_CREATE_MODE_KEY, PRF_MODES[PRF_MODES.indexOf(m) + 1]);
        continue;
      }
      throw e;
    }
  }
  if (!credential) throw new Error("Passkey registration failed.");
  localStorage.setItem(PRF_CREATE_MODE_KEY, mode);

  const extResults = (credential.getClientExtensionResults() as any);
  const credentialId = bufferToBase64url(credential.rawId);

  // Platform authenticators can evaluate PRF at registration; take it.
  if (extResults?.prf?.results?.first) {
    return {
      credentialId,
      prfOutput: extResults.prf.results.first,
    };
  }

  // Two cases land here, both resolved by an immediate assertion against the
  // fresh credential:
  //  - security keys (YubiKey et al.): CTAP hmac-secret only evaluates at
  //    assertion time, so create() returns enabled: true and no results;
  //  - WebKit "bare" mode: the extension never reached create(), but iCloud
  //    Keychain passkeys can still evaluate PRF in an assertion.
  // Costs the user a second touch, the standard flow for security-key PRF.
  if (extResults?.prf?.enabled === true || mode === "bare") {
    return authenticatePasskey(did, credentialId);
  }

  throw new Error(
    "Your browser or authenticator does not support the PRF extension. " +
    "ATSMS requires this feature for key derivation. " +
    `(registration mode: ${mode})`,
  );
}

export async function authenticatePasskey(
  did: string,
  credentialId?: string,
): Promise<{ credentialId: string; prfOutput: ArrayBuffer }> {
  const salt = await computeSalt(did);

  const allowCredentials = credentialId
    ? [
        {
          type: "public-key" as const,
          id: base64urlToBuffer(credentialId),
        },
      ]
    : undefined;

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: getPasskeyRpId(),
      allowCredentials,
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: salt,
          },
        },
      } as any,
    },
  })) as PublicKeyCredential;

  const extResults = (credential.getClientExtensionResults() as any);
  if (!extResults?.prf?.results?.first) {
    throw new Error(
      "PRF extension output not available. Authentication failed.",
    );
  }

  return {
    credentialId: bufferToBase64url(credential.rawId),
    prfOutput: extResults.prf.results.first,
  };
}

export async function deriveP256PrivateKeyPEM(
  prfOutput: ArrayBuffer,
  did: string,
): Promise<string> {
  // Import PRF output as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "HKDF",
    false,
    ["deriveBits"],
  );

  // Derive 32 bytes using HKDF
  const encoder = new TextEncoder();
  const didSalt = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(did),
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(didSalt),
      info: encoder.encode(HKDF_INFO),
    },
    keyMaterial,
    256,
  );

  // Reduce modulo P-256 curve order to get a valid scalar
  const scalar = reduceMod(new Uint8Array(derivedBits), P256_ORDER);

  // Import via PKCS#8 DER
  const pkcs8Der = buildP256Pkcs8(scalar);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );

  // Export as PKCS#8 PEM (re-export to get canonical encoding)
  const exported = await crypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToPEM(exported, "PRIVATE KEY");
}

function reduceMod(bytes: Uint8Array, modulus: bigint): Uint8Array {
  let value = BigInt(0);
  for (const b of bytes) {
    value = (value << BigInt(8)) | BigInt(b);
  }

  let reduced = value % modulus;
  if (reduced === BigInt(0)) {
    reduced = BigInt(1); // Avoid zero scalar
  }

  const result = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    result[i] = Number(reduced & BigInt(0xff));
    reduced >>= BigInt(8);
  }
  return result;
}

function buildP256Pkcs8(privateKeyBytes: Uint8Array): ArrayBuffer {
  // Build PKCS#8 by assembling DER pieces inside-out.
  // ECPrivateKey (RFC 5915): SEQUENCE { INTEGER 1, OCTET STRING d }
  const ecPrivateKeyValue = concat([
    new Uint8Array([0x02, 0x01, 0x01]),                     // INTEGER 1
    new Uint8Array([0x04, 0x20, ...privateKeyBytes]),       // OCTET STRING (32 bytes)
  ]);
  const ecPrivateKey = derSequence(ecPrivateKeyValue);

  // AlgorithmIdentifier: SEQUENCE { OID ecPublicKey, OID prime256v1 }
  const algId = new Uint8Array([
    0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,       // ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // prime256v1
  ]);

  // PrivateKeyInfo: SEQUENCE { INTEGER 0, AlgorithmIdentifier, OCTET STRING ECPrivateKey }
  const privateKeyInfo = derSequence(concat([
    new Uint8Array([0x02, 0x01, 0x00]),  // INTEGER 0 (version)
    algId,
    derOctetString(ecPrivateKey),
  ]));

  return privateKeyInfo.buffer as ArrayBuffer;
}

function derSequence(content: Uint8Array): Uint8Array {
  return derTLV(0x30, content);
}

function derOctetString(content: Uint8Array): Uint8Array {
  return derTLV(0x04, content);
}

function derTLV(tag: number, value: Uint8Array): Uint8Array {
  const len = value.length;
  let header: Uint8Array;
  if (len < 128) {
    header = new Uint8Array([tag, len]);
  } else if (len < 256) {
    header = new Uint8Array([tag, 0x81, len]);
  } else {
    header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
  }
  return concat([header, value]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function arrayBufferToPEM(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

/**
 * Mock passkey for localhost development.
 * Generates a deterministic PRF-like output from the DID using HKDF.
 */
export async function mockRegisterPasskey(
  did: string,
): Promise<{ credentialId: string; prfOutput: ArrayBuffer }> {
  const encoder = new TextEncoder();
  const seed = await crypto.subtle.digest("SHA-256", encoder.encode("mock-passkey-" + did));
  const credentialId = "mock-credential-" + did;
  return { credentialId, prfOutput: seed };
}

export async function mockAuthenticatePasskey(
  did: string,
): Promise<{ credentialId: string; prfOutput: ArrayBuffer }> {
  // Same deterministic output as register
  return mockRegisterPasskey(did);
}
