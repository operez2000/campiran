// ============================================================
// CAMPIRAN — WebAuthn Utility
// Soporte nativo para Face ID, Touch ID, Windows Hello y Passkeys
// ============================================================

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function isWebAuthnAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential) return false
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    return available
  } catch {
    return false
  }
}

export interface RegisterWebAuthnParams {
  userId: string
  userName: string
  userEmail: string
}

export interface WebAuthnCredentialData {
  id: string
  rawId: string
  type: string
  transports?: string[]
  createdAt: string
  deviceName?: string
}

/**
 * Enrola una credencial biométrica en el dispositivo del usuario
 */
export async function registerWebAuthnCredential({
  userId,
  userName,
  userEmail,
}: RegisterWebAuthnParams): Promise<WebAuthnCredentialData> {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn no está soportado en este navegador')
  }

  // Generar challenge aleatorio
  const challenge = new Uint8Array(32)
  window.crypto.getRandomValues(challenge)

  // User ID como buffer
  const encoder = new TextEncoder()
  const userIdBuffer = encoder.encode(userId.slice(0, 32))

  const hostname = window.location.hostname

  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Campiran POS',
      id: hostname === 'localhost' || hostname === '127.0.0.1' ? undefined : hostname,
    },
    user: {
      id: userIdBuffer,
      name: userEmail || userName || 'cajero@campiran.com',
      displayName: userName || 'Cajero Campiran',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Face ID / Touch ID / Windows Hello integrado
      userVerification: 'required',
      requireResidentKey: false,
    },
    timeout: 60000,
    attestation: 'none',
  }

  const credential = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('No se pudo generar la credencial biométrica')
  }

  const rawIdBase64 = bufferToBase64(credential.rawId)

  // Obtener transports si están disponibles
  const response = credential.response as AuthenticatorAttestationResponse & {
    getTransports?: () => string[]
  }
  const transports = typeof response.getTransports === 'function' ? response.getTransports() : ['internal']

  return {
    id: credential.id,
    rawId: rawIdBase64,
    type: credential.type,
    transports,
    createdAt: new Date().toISOString(),
    deviceName: navigator.userAgent.includes('Mac')
      ? 'Apple Touch ID / Face ID'
      : navigator.userAgent.includes('Windows')
      ? 'Windows Hello'
      : navigator.userAgent.includes('Android')
      ? 'Android Biometrics'
      : 'Sensor Biométrico',
  }
}

/**
 * Autentica al cajero mediante su sensor biométrico (Touch ID / Face ID / Windows Hello)
 */
export async function authenticateWebAuthn(credentialId?: string): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn no está disponible en este dispositivo')
  }

  const challenge = new Uint8Array(32)
  window.crypto.getRandomValues(challenge)

  const hostname = window.location.hostname

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: hostname === 'localhost' || hostname === '127.0.0.1' ? undefined : hostname,
    timeout: 60000,
    userVerification: 'required',
  }

  if (credentialId) {
    requestOptions.allowCredentials = [
      {
        id: base64ToBuffer(credentialId),
        type: 'public-key',
        transports: ['internal'],
      },
    ]
  }

  const assertion = await navigator.credentials.get({
    publicKey: requestOptions,
  })

  return !!assertion
}
