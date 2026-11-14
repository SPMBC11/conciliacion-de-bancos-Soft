import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../../config.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Token opaco aleatorio (256 bits) para refresh, invitaciones y recuperación. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** En BD solo se guarda el hash: una filtración de la tabla no permite usar los tokens. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const secret = new TextEncoder().encode(config.JWT_SECRET);

export async function signAccessToken(userId: string, sessionFamilyId: string) {
  return new SignJWT({ sid: sessionFamilyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .setIssuer('finagent')
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionFamilyId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'finagent',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionFamilyId: payload.sid };
  } catch {
    return null;
  }
}
