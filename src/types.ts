export interface Config {
    bitmagnetUrl: string;
    tmdbApiKey?: string;
    premiumizeApiKey?: string;
    bitmagnetTimeout: number;
    bitmagnetSortField: string;
    bitmagnetSortDescending: boolean;
    bitmagnetSearchLimit: number;
}

export interface ManifestConfigItem {
    key: string;
    type: string;
    default?: string;
    title: string;
    options?: string[];
    required?: boolean;
}