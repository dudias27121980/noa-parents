// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth';

const tokenOf = (r: ReturnType<ReturnType<typeof createAuth>['login']>) => (r.ok ? r.token : '');

describe('station tokens', () => {
  it('a valid token names its station', () => {
    const auth = createAuth({ accessCode: 'c', secret: 's1' });
    expect(auth.verify(tokenOf(auth.login('עמדה א', 'c', 'ip')))).toBe('עמדה א');
  });

  it('rejects a well-formed token whose station was swapped (signature no longer matches)', () => {
    const auth = createAuth({ accessCode: 'c', secret: 's1' });
    const [payload, sig] = tokenOf(auth.login('עמדה א', 'c', 'ip')).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, s: 'מפקד' })).toString('base64url');
    expect(auth.verify(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a token signed by a different server', () => {
    const other = createAuth({ accessCode: 'c', secret: 'other-secret' });
    const auth = createAuth({ accessCode: 'c', secret: 's1' });
    expect(auth.verify(tokenOf(other.login('עמדה א', 'c', 'ip')))).toBeNull();
  });

  it('expires after a shift (12 hours)', () => {
    let t = 0;
    const auth = createAuth({ accessCode: 'c', secret: 's1', now: () => t });
    const token = tokenOf(auth.login('עמדה א', 'c', 'ip'));
    t = 11.9 * 3600_000;
    expect(auth.verify(token)).toBe('עמדה א');
    t = 12.1 * 3600_000;
    expect(auth.verify(token)).toBeNull();
  });

  it('lockout lifts after a minute and is per address', () => {
    let t = 0;
    const auth = createAuth({ accessCode: 'c', secret: 's1', now: () => t });
    for (let i = 0; i < 5; i++) auth.login('x', 'wrong', 'ip-1');
    expect(auth.login('x', 'c', 'ip-1').ok).toBe(false);
    expect(auth.login('x', 'c', 'ip-2').ok).toBe(true);
    t = 61_000;
    expect(auth.login('x', 'c', 'ip-1').ok).toBe(true);
  });
});
