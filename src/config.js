import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
export const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
const parsed = new URL(baseUrl);
if (parsed.pathname !== '/' || !((parsed.protocol === 'http:' && parsed.hostname === 'localhost') || parsed.protocol === 'https:')) {
    throw new Error('APP_BASE_URL must be http://localhost:3000 locally or an HTTPS URL when deployed.');
}
export const issuer = process.env.IDP_ISSUER || '';
export const entityId = process.env.SP_ENTITY_ID || 'urn:storeops:local';
export const callbackUrl = `${baseUrl}/auth/saml/acs`;
export const jit = process.env.JIT_ENABLED !== 'false';
const certPath = process.env.IDP_CERT_PATH || 'config/auth0-signing.pem';
const cert = process.env.IDP_CERT_PEM || (existsSync(certPath) ? readFileSync(certPath, 'utf8') : '');
export const missing = [!process.env.IDP_SSO_URL && 'IDP_SSO_URL', !issuer && 'IDP_ISSUER', !cert && 'IDP_CERT_PEM or IDP_CERT_PATH'].filter(Boolean);
export function makeSaml() {
    if (missing.length)
        return undefined;
    const entryPoint = process.env.IDP_SSO_URL;
    if (new URL(entryPoint).protocol !== 'https:')
        throw new Error('IdP SSO URL must use HTTPS');
    return new SAML({
        callbackUrl, entryPoint, issuer: entityId, audience: entityId,
        idpCert: cert,
        wantAssertionsSigned: true, wantAuthnResponseSigned: false,
        validateInResponseTo: ValidateInResponseTo.always,
        requestIdExpirationPeriodMs: 300_000, maxAssertionAgeMs: 300_000,
        acceptedClockSkewMs: 5_000, disableRequestedAuthnContext: true,
        identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
        signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256'
    });
}
mkdirSync('data', { recursive: true });
