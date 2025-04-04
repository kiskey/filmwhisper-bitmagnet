export interface PremiumizeStreamResult {
    url: string;
    filename: string; 
}

export { checkPremiumizeCacheBulk, type PremiumizeCacheStatus } from './premiumize_cachestatus.ts';
export { getPremiumizeDirectDownloadLink } from './premiumize_directdl.ts';