// Password hashing utilities for Cloudflare Workers
// Using Web Crypto API for compatibility

const SALT_LENGTH = 16;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

export async function hash(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH
  );

  const hashArray = new Uint8Array(hashBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combined));
}

export async function verify(passwordHash: string, password: string): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(passwordHash), (c) => c.charCodeAt(0));

    if (combined.length < SALT_LENGTH) {
      return false;
    }

    const salt = combined.slice(0, SALT_LENGTH);
    const storedHash = combined.slice(SALT_LENGTH);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      KEY_LENGTH
    );

    const computedHash = new Uint8Array(hashBits);

    if (computedHash.length !== storedHash.length) {
      return false;
    }

    // Constant-time comparison
    let result = 0;
    for (let i = 0; i < computedHash.length; i++) {
      result |= computedHash[i] ^ storedHash[i];
    }

    return result === 0;
  } catch {
    return false;
  }
}
