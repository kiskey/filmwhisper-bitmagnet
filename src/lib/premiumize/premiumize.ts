export interface PremiumizeStreamResult {
    url: string;
    filename: string; 
}

// Import the functions to be wrapped
import { checkPremiumizeCacheBulk as _checkPremiumizeCacheBulk, type PremiumizeCacheStatus } from './premiumize_cachestatus.ts';
import { getPremiumizeDirectDownloadLink as _getPremiumizeDirectDownloadLink } from './premiumize_directdl.ts';

// Export functions within an object
export const premiumizeApi = {
    checkPremiumizeCacheBulk: _checkPremiumizeCacheBulk,
    getPremiumizeDirectDownloadLink: _getPremiumizeDirectDownloadLink,
};

// Re-export types
export type { PremiumizeCacheStatus };