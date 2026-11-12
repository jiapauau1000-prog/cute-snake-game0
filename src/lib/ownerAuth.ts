import { isPlausibleEditToken } from './shareCode';
import { secureEqual } from './secureCompare';

/**
 * Owner actions (delete / rotate / privileged writes) require an edit token
 * that is distinct from the public share code.
 */
export function matchesOwnerEditToken(
  shareCode: string,
  storedToken: string,
  offeredToken: string,
): boolean {
  if (!isPlausibleEditToken(offeredToken)) return false;
  if (secureEqual(offeredToken, shareCode) || secureEqual(storedToken, shareCode)) {
    return false;
  }
  return secureEqual(storedToken, offeredToken);
}
