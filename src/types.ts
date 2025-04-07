export interface Config {
    bitmagnetUrl: string;
    tmdbApiKey?: string;
    premiumizeApiKey?: string;
    bitmagnetTimeout: number;
    bitmagnetSortField: string;
    bitmagnetSortDescending: boolean;
    bitmagnetSearchLimit: number;
}