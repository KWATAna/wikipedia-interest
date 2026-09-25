/** Shared shapes for the manifest, calculations, and report. */

export type MonthlySeries = Record<string, number>;
export type NullableMonthlySeries = Record<string, number | null>;
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';
export type Direction = 'insufficient' | 'rising' | 'falling' | 'mixed';

export interface Screening {
  minRecentViews: number;
  minConfidence: Exclude<Confidence, 'insufficient'>;
  requireRawGrowth: boolean;
  requireShareGrowth: boolean;
}

export interface ManifestEdition {
  language: string;
  articles: string[];
  rationale: string;
}

export interface Manifest {
  topic: string;
  question: string;
  editions: ManifestEdition[];
  screening: Screening;
  assumptions: string[];
}

export interface LanguageResult {
  language: string;
  articles: string[];
  months: string[];
  monthlyViews: NullableMonthlySeries;
  loadedMonths: number;
  articleObservations: number;
  coverageComplete: boolean;
  observedViewsPrior: number;
  observedViewsRecent: number;
  viewsPrior: number | null;
  viewsRecent: number | null;
  viewsYoyPct: number | null;
  sharePriorPerMillion: number | null;
  shareRecentPerMillion: number | null;
  shareYoyPct: number | null;
  positiveYoyMonths: number;
  negativeYoyMonths: number;
  comparableYoyMonths: number;
  direction: Direction;
  peakMonthShare: number | null;
  confidence: Confidence;
  flags: string[];
}

export interface SourceArticle {
  title: string;
  url: string;
  requestedTitle?: string;
  pageId?: number;
  analyticsUrl?: string;
  analyticsStatus?: number;
  fetchedAt?: string;
  cacheHit?: boolean;
  resolutionUrl?: string;
}

export interface SourceEdition {
  language: string;
  articles: SourceArticle[];
  rationale?: string;
  projectAnalyticsUrl?: string;
  projectFetchedAt?: string;
  projectCacheHit?: boolean;
}

export interface Analysis {
  topic: string;
  question?: string;
  assumptions?: string[];
  screening?: Screening;
  period: { first: string; last: string };
  selectedCandidate: string | null;
  results: LanguageResult[];
  sources: SourceEdition[];
  generatedAt?: string;
  methodology?: Record<string, string>;
}
