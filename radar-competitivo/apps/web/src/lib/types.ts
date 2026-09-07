/** Tipos espelhando os contratos da API. */

export type Role = 'SELF' | 'COMPETITOR';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Effort = 'LOW' | 'MEDIUM' | 'HIGH';
export type Horizon = 'D7' | 'D30' | 'D90';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'CANCELLED';
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO' | 'POSITIONING' | 'OPPORTUNITY';
export type InsightKind = 'OPPORTUNITY' | 'THREAT' | 'STRENGTH' | 'WEAKNESS' | 'TREND';
export type DataNature = 'CONFIRMED' | 'ESTIMATED' | 'ANALYSIS' | 'RECOMMENDATION' | 'UNAVAILABLE';

export type ScoreComponent = { key: string; label: string; weight: number; value: number | null; detail: string };

export type Organization = { id: string; name: string; slug: string; plan: string; isDemo: boolean };
export type User = { id: string; name: string; email: string };

export type ProjectSummary = {
  id: string; name: string; segment: string | null; city: string | null; state: string | null;
  frequency: string; lastAnalyzedAt: string | null; createdAt: string;
  counts: { companies: number; competitors: number; alerts: number; insights: number; recommendations: number };
  self: { id: string; name: string; role: Role; lastCollectedAt: string | null } | null;
};

export type Job = {
  id: string; type: string; status: JobStatus; progressDone: number; progressTotal: number;
  currentStep: string | null; pagesFetched: number; pagesSkipped: number; pagesFailed: number;
  error: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string;
};
export type JobLog = { id: string; level: string; message: string; createdAt: string };

export type ReputationView = {
  rating: number | null; reviewCount: number | null;
  sources: { sourceLabel: string; sourceUrl: string; rating: number | null; reviewCount: number | null; observedAt: string }[];
  history: { observedAt: string; rating: number | null; reviewCount: number | null }[];
  themes: { theme: string; polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED'; mentions: number; positive: number; negative: number; sampleQuote?: string }[];
  sentiment: { positive: number; negative: number; neutral: number; mixed: number; averageScore: number | null };
  reviewsAnalyzed: number; available: boolean; note: string | null;
};

export type CompanyView = {
  id: string; role: Role; name: string; domain: string | null; website: string | null;
  city: string | null; state: string | null; segment: string | null; description: string | null;
  phone: string | null; email: string | null; address: string | null; priceRange: string | null;
  openingHours: string | null; unitsCount: number | null; isDemo: boolean; lastCollectedAt: string | null;
  reputation: ReputationView;
  offerings: { kind: string; name: string; normalized: string; url: string | null; evidenceId: string | null }[];
  prices: { label: string; amount: number; currency: string; unit: string | null; isPromo: boolean; observedAt: string; url: string | null }[];
  priceHistory: Record<string, { amount: number; observedAt: string; isPromo: boolean }[]>;
  social: { platform: string; url: string; handle: string | null; followers: number | null; note: string | null }[];
  website_metrics: {
    score: number | null; components: ScoreComponent[]; coverage: number; methodology: string;
    pagesCrawled: number; pagesDiscovered: number; hasBlog: boolean; blogPostsSeen: number;
    publishIntervalDays: number | null; hasContactForm: boolean; hasWhatsapp: boolean; ctaCount: number;
    httpsOk: boolean; avgResponseMs: number | null;
  } | null;
  seo_metrics: {
    score: number | null; components: ScoreComponent[]; coverage: number; methodology: string;
    indexablePages: number; structuredDataTypes: string[]; keywords: { term: string; count: number }[];
    titleCoverage: number | null; descriptionCoverage: number | null; h1Coverage: number | null;
    wordCountTotal: number; hasLocalSignals: boolean;
  } | null;
  changes: { kind: string; impact: string; summary: string; observedAt: string; evidenceId: string | null }[];
  signals: { kind: string; label: string; detail: string | null; strength: number; methodology: string | null; observedAt: string }[];
  images: { url: string; category: string; alt: string | null; pageUrl: string | null }[];
  sources: { kind: string; url: string; label: string | null; trust: number; lastSeenAt: string | null }[];
  snapshots: { collectedAt: string; websiteScore: number | null; seoScore: number | null }[];
  dataQuality?: DataQuality;
};

export type DataQuality = {
  score: number; sourcesCount: number; freshnessDays: number | null;
  breakdown: { key: string; label: string; weight: number; value: number; detail: string }[];
};

export type Dashboard = {
  project: { id: string; name: string; segment: string | null; city: string | null; state: string | null; lastAnalyzedAt: string | null; frequency: string };
  marketScore: { value: number | null; coverage: number; methodology: string; components: ScoreComponent[] } | null;
  position: { rank: number; total: number } | null;
  counts: { competitors: number; newAlerts: number; opportunities: number; threats: number; recommendations: number; recentChanges: number };
  highlights: {
    bestRated: { companyId: string; name: string; rating: number | null; reviewCount: number | null; source: string | null } | null;
    bestPresence: { companyId: string; name: string; detail: string } | null;
    mostActive: { companyId: string; name: string; threatScore: number | null; factors: { label: string; contribution: number; detail: string }[] } | null;
    fastestGrowth: { companyId: string; name: string; detail: string } | null;
  };
  dataQuality: (DataQuality & { companyId: string; name: string })[];
  lastJob: Job | null;
  isDemo: boolean;
};

export type MatrixRow = {
  key: string; label: string; weight: number;
  cells: { companyId: string; name: string; role: Role; value: number | null; display: string; detail: string }[];
  best: string | null;
};
export type Benchmark = {
  dimension: string; label: string; self: number | null; competitorAverage: number | null;
  bestCompetitor: { name: string; value: number } | null; worstCompetitor: { name: string; value: number } | null;
  deltaVsAveragePct: number | null; sampleSize: number; note: string | null;
};
export type MatrixResponse = {
  matrix: MatrixRow[]; benchmarks: Benchmark[];
  scores: {
    companyId: string; name: string; role: Role; composite: number | null; coverage: number;
    components: ScoreComponent[]; methodology: string;
    threat: { score: number | null; factors: { label: string; contribution: number; detail: string }[]; methodology: string };
  }[];
};

export type GapRow = {
  normalized: string; label: string; kind: string; self: boolean;
  competitors: { companyId: string; name: string; has: boolean; url: string | null; evidenceId: string | null }[];
  competitorsWithCount: number; coveragePct: number;
};
export type GapAnalysis = {
  rows: GapRow[]; missingInSelf: GapRow[]; exclusiveToSelf: GapRow[];
  selfOfferingCount: number; competitorCount: number; available: boolean; note: string | null;
};

export type Insight = {
  id: string; kind: InsightKind; title: string; body: string; score: number | null; confidence: number;
  nature: DataNature; createdAt: string;
  evidenceRefs: { label: string; url?: string; value?: string; evidenceId?: string }[] | null;
  company: { id: string; name: string } | null;
};

export type Recommendation = {
  id: string; problem: string; evidence: string; potentialImpact: string; action: string; successMetric: string;
  priority: Priority; effort: Effort; horizon: Horizon; impactValue: number; effortValue: number; status: string;
  evidenceRefs: { label: string; url?: string; evidenceId?: string }[] | null;
  company: { id: string; name: string } | null;
};

export type Alert = {
  id: string; severity: AlertSeverity; status: 'NEW' | 'READ' | 'ARCHIVED'; title: string; body: string;
  changeKind: string | null; observedAt: string; createdAt: string;
  company: { id: string; name: string } | null;
  evidence: { id: string; url: string; excerpt: string | null; collectedAt: string } | null;
};

export type ChangeRow = {
  id: string; kind: string; impact: string; summary: string; previousValue: string | null; currentValue: string | null;
  observedAt: string; company: { id: string; name: string; role?: Role };
  evidence: { id: string; url: string; excerpt: string | null; collectedAt: string; sourceLabel?: string | null } | null;
};

export type ReportSection = {
  id: string; title: string; kind: 'text' | 'list' | 'table' | 'timeline' | 'kv';
  body?: string; items?: string[]; table?: { headers: string[]; rows: (string | number | null)[][] };
  kv?: { label: string; value: string; note?: string }[]; note?: string;
};
export type ReportDocument = {
  title: string; projectName: string; generatedAt: string; isDemo: boolean; aiEnriched: boolean;
  disclaimer: string; sections: ReportSection[];
};

export type AskResponse = {
  status: string; answer: string;
  grounding: { verdict: string; checkedValues: number; supportedValues: number; violations: { type: string; value: string; context: string }[]; notes: string[] } | null;
  toolsUsed: { tool: string; input: unknown; ok: boolean }[];
  model: string | null; latencyMs: number;
};

export type HistoryResponse = {
  metrics: {
    companyId: string; compositeScore: number | null; reputationScore: number | null; seoScore: number | null;
    presenceScore: number | null; threatScore: number | null; coverage: number; computedAt: string;
  }[];
  companies: { id: string; name: string; role: Role }[];
};
