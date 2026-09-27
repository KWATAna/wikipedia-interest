/** Shared shapes for the manifest, calculations, and report. */

import type { MoveEvent } from './client.ts';

export type MonthlySeries = Record<string, number>;
export type NullableMonthlySeries = Record<string, number | null>;
export type ArticleMonthStatus = 'reported' | 'zero' | 'unknown';
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';
export type Direction = 'insufficient' | 'rising' | 'falling' | 'mixed';

export interface PeakPairSensitivity {
  status: 'available' | 'incomplete-data' | 'zero-traffic' | 'zero-baseline';
  peakMonth: string | null;
  excludedMonths: { prior: string; recent: string } | null;
  viewsPrior: number | null;
  viewsRecent: number | null;
  viewsYoyPct: number | null;
  sharePriorPerMillion: number | null;
  shareRecentPerMillion: number | null;
  shareYoyPct: number | null;
  rawDirectionChanged: boolean | null;
  shareDirectionChanged: boolean | null;
}

export interface ArticleTrend {
  title: string;
  viewsPrior: number | null;
  viewsRecent: number | null;
  viewsYoyPct: number | null;
  direction: 'rising' | 'falling' | 'flat' | 'unavailable';
}

export interface Screening {
  minRecentViews: number;
  minConfidence: Exclude<Confidence, 'insufficient'>;
  requireRawGrowth: boolean;
  requireShareGrowth: boolean;
  requireRisingDirection: boolean;
}

export type ScreeningCriterion = 'recent-volume' | 'signal-quality' | 'raw-growth'
  | 'share-growth' | 'monthly-direction';
export interface ScreeningCheck {
  criterion: ScreeningCriterion;
  status: 'pass' | 'fail' | 'not-required';
  observed: number | Confidence | Direction | null;
  requirement: string;
  explanation: string;
}
export interface ScreeningAssessment {
  eligible: boolean;
  eligibleRank: number | null;
  checks: ScreeningCheck[];
}

export interface ManifestEdition {
  language: string;
  articles: string[];
  rationale: string;
  formerTitles?: Record<string, string[]>;
}

export interface Manifest {
  topic: string;
  question: string;
  editions: ManifestEdition[];
  screening: Screening;
  assumptions: string[];
  conceptMismatchRationale?: string;
}

export interface ConceptCheck {
  status: 'single-edition' | 'matched' | 'mismatch-reviewed' | 'unverified';
  editions: Array<{ language: string; articles: Array<{ title: string; wikidataId: string | null }> }>;
  reviewRationale?: string;
}

export interface LanguageResult {
  language: string;
  articles: string[];
  months: string[];
  monthlyViews: NullableMonthlySeries;
  articleMonthlyViews: Record<string, NullableMonthlySeries>;
  editionMonthlyViews: NullableMonthlySeries;
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
  screeningAssessment?: ScreeningAssessment;
  flags: string[];
  peakPairSensitivity?: PeakPairSensitivity;
  articleTrends?: ArticleTrend[];
}

export interface SourceArticle {
  title: string;
  url: string;
  wikidataId?: string | null;
  requestedTitle?: string;
  pageId?: number;
  analyticsUrl?: string;
  analyticsStatus?: number | null;
  analyticsError?: string;
  fetchedAt?: string;
  cacheHit?: boolean;
  resolutionUrl?: string;
  monthStatus?: Record<string, ArticleMonthStatus>;
  historyStatus?: 'unchecked' | 'verified-move' | 'uncertain';
  historyError?: string;
  moveEvents?: MoveEvent[];
  moveLookupUrls?: string[];
  uncertainMonths?: string[];
  trafficSegments?: Array<{ title: string; first: string; last: string; analyticsUrl: string;
    analyticsStatus: number | null; analyticsError?: string; fetchedAt: string; cacheHit: boolean }>;
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
  nextValidationStep?: string;
  results: LanguageResult[];
  sources: SourceEdition[];
  conceptCheck?: ConceptCheck;
  generatedAt?: string;
  methodology?: Record<string, string>;
}
