-- CreateEnum
CREATE TYPE "DataNature" AS ENUM ('CONFIRMED', 'ESTIMATED', 'ANALYSIS', 'RECOMMENDATION', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'AGENCY');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('SELF', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_ANALYSIS', 'COMPANY_CRAWL', 'DISCOVERY', 'AI_ANALYSIS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('FETCHED', 'NOT_MODIFIED', 'SKIPPED_ROBOTS', 'SKIPPED_LIMIT', 'BLOCKED_SECURITY', 'ERROR');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('WEBSITE', 'SITEMAP', 'RSS', 'SEARCH_ENGINE', 'DIRECTORY', 'REVIEW_PORTAL', 'SOCIAL_PROFILE', 'NEWS', 'JOBS', 'STRUCTURED_DATA', 'USER_PROVIDED', 'DEMO_DATASET');

-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('PAGE_ADDED', 'PAGE_REMOVED', 'CONTENT_CHANGED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'CTA_CHANGED', 'PRODUCT_ADDED', 'PRODUCT_REMOVED', 'PRICE_CHANGED', 'SERVICE_ADDED', 'SERVICE_REMOVED', 'REVIEW_VOLUME_CHANGED', 'RATING_CHANGED', 'SOCIAL_PROFILE_ADDED', 'SOCIAL_PROFILE_REMOVED', 'SOCIAL_BIO_CHANGED', 'CONTACT_CHANGED', 'ADDRESS_CHANGED', 'JOB_POSTING_OBSERVED', 'BLOG_ACTIVITY_CHANGED', 'POSITIONING_CHANGED');

-- CreateEnum
CREATE TYPE "ChangeImpact" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'INFO', 'POSITIONING', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('OPPORTUNITY', 'THREAT', 'STRENGTH', 'WEAKNESS', 'TREND');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Horizon" AS ENUM ('D7', 'D30', 'D90');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CrawlFrequency" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('EXECUTIVE_SYNTHESIS', 'CHAT', 'REVIEW_THEMES', 'POSITIONING');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'UNAVAILABLE', 'REJECTED_UNGROUNDED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "description" TEXT,
    "frequency" "CrawlFrequency" NOT NULL DEFAULT 'MANUAL',
    "last_analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL DEFAULT 'COMPETITOR',
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "segment" TEXT,
    "subsegment" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "price_range" TEXT,
    "opening_hours" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "units_count" INTEGER,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "last_collected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "trust" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "company_id" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "current_step" TEXT,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "pages_skipped" INTEGER NOT NULL DEFAULT 0,
    "pages_failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_pages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "job_id" TEXT,
    "url" TEXT NOT NULL,
    "final_url" TEXT,
    "status" "PageStatus" NOT NULL,
    "http_status" INTEGER,
    "content_type" TEXT,
    "content_hash" TEXT,
    "etag" TEXT,
    "last_modified" TEXT,
    "bytes" INTEGER,
    "fetch_ms" INTEGER,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "text" TEXT,
    "raw_html" TEXT,
    "error" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "job_id" TEXT,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_changes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "kind" "ChangeKind" NOT NULL,
    "impact" "ChangeImpact" NOT NULL DEFAULT 'INFO',
    "field" TEXT,
    "previous_value" TEXT,
    "current_value" TEXT,
    "summary" TEXT NOT NULL,
    "evidence_id" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_label" TEXT,
    "rating" DOUBLE PRECISION,
    "text" TEXT,
    "language" TEXT,
    "published_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_hash" TEXT NOT NULL,
    "evidence_id" TEXT,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_summaries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source_label" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "nature" "DataNature" NOT NULL DEFAULT 'CONFIRMED',
    "evidence_id" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_themes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "polarity" TEXT NOT NULL,
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "sample_quote" TEXT,
    "method" TEXT NOT NULL DEFAULT 'lexicon',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "url" TEXT,
    "evidence_id" TEXT,
    "nature" "DataNature" NOT NULL DEFAULT 'CONFIRMED',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_observations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "offering_id" TEXT,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "unit" TEXT,
    "is_promo" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "evidence_id" TEXT,
    "nature" "DataNature" NOT NULL DEFAULT 'CONFIRMED',
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT,
    "url" TEXT NOT NULL,
    "evidence_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_snapshots" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "followers" INTEGER,
    "posts" INTEGER,
    "bio" TEXT,
    "nature" "DataNature" NOT NULL DEFAULT 'CONFIRMED',
    "note" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "pages_crawled" INTEGER NOT NULL DEFAULT 0,
    "pages_discovered" INTEGER NOT NULL DEFAULT 0,
    "has_sitemap" BOOLEAN NOT NULL DEFAULT false,
    "has_rss" BOOLEAN NOT NULL DEFAULT false,
    "has_blog" BOOLEAN NOT NULL DEFAULT false,
    "blog_posts_seen" INTEGER NOT NULL DEFAULT 0,
    "publish_interval_days" DOUBLE PRECISION,
    "has_contact_form" BOOLEAN NOT NULL DEFAULT false,
    "has_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "has_phone" BOOLEAN NOT NULL DEFAULT false,
    "cta_count" INTEGER NOT NULL DEFAULT 0,
    "form_count" INTEGER NOT NULL DEFAULT 0,
    "social_links" INTEGER NOT NULL DEFAULT 0,
    "avg_response_ms" INTEGER,
    "https_ok" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "breakdown" JSONB,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "indexable_pages" INTEGER NOT NULL DEFAULT 0,
    "title_coverage" DOUBLE PRECISION,
    "description_coverage" DOUBLE PRECISION,
    "h1_coverage" DOUBLE PRECISION,
    "avg_title_length" DOUBLE PRECISION,
    "structured_data_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "has_open_graph" BOOLEAN NOT NULL DEFAULT false,
    "has_canonical" BOOLEAN NOT NULL DEFAULT false,
    "has_robots_txt" BOOLEAN NOT NULL DEFAULT false,
    "has_local_signals" BOOLEAN NOT NULL DEFAULT false,
    "image_alt_coverage" DOUBLE PRECISION,
    "internal_links" INTEGER NOT NULL DEFAULT 0,
    "keywords" JSONB,
    "word_count_total" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "breakdown" JSONB,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_images" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "page_url" TEXT,
    "category" TEXT NOT NULL DEFAULT 'outras',
    "alt" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "evidence_id" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_signals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "nature" "DataNature" NOT NULL DEFAULT 'ESTIMATED',
    "methodology" TEXT,
    "evidence_id" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitive_metrics" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reputation_score" DOUBLE PRECISION,
    "presence_score" DOUBLE PRECISION,
    "offer_score" DOUBLE PRECISION,
    "content_score" DOUBLE PRECISION,
    "seo_score" DOUBLE PRECISION,
    "experience_score" DOUBLE PRECISION,
    "activity_score" DOUBLE PRECISION,
    "price_score" DOUBLE PRECISION,
    "growth_score" DOUBLE PRECISION,
    "composite_score" DOUBLE PRECISION,
    "threat_score" DOUBLE PRECISION,
    "breakdown" JSONB,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitive_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_scores" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sources_count" INTEGER NOT NULL DEFAULT 0,
    "freshness_days" DOUBLE PRECISION,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplication" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "company_id" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "change_kind" "ChangeKind",
    "evidence_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "company_id" TEXT,
    "kind" "InsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence_refs" JSONB,
    "nature" "DataNature" NOT NULL DEFAULT 'ANALYSIS',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "score" DOUBLE PRECISION,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "company_id" TEXT,
    "problem" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "potential_impact" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "success_metric" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "effort" "Effort" NOT NULL,
    "horizon" "Horizon" NOT NULL,
    "evidence_refs" JSONB,
    "nature" "DataNature" NOT NULL DEFAULT 'RECOMMENDATION',
    "impact_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effort_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "ai_enriched" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "company_id" TEXT,
    "source_kind" "SourceKind" NOT NULL,
    "source_label" TEXT,
    "url" TEXT NOT NULL,
    "excerpt" TEXT,
    "content_hash" TEXT,
    "http_status" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "user_id" TEXT,
    "kind" "AiRunKind" NOT NULL,
    "status" "AiRunStatus" NOT NULL,
    "model" TEXT,
    "question" TEXT,
    "answer" TEXT,
    "tool_trace" JSONB,
    "grounding_report" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "robots_cache" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER,

    CONSTRAINT "robots_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "companies_organization_id_idx" ON "companies"("organization_id");

-- CreateIndex
CREATE INDEX "companies_project_id_role_idx" ON "companies"("project_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "companies_project_id_domain_key" ON "companies"("project_id", "domain");

-- CreateIndex
CREATE INDEX "sources_company_id_idx" ON "sources"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_company_id_url_key" ON "sources"("company_id", "url");

-- CreateIndex
CREATE INDEX "crawl_jobs_organization_id_status_idx" ON "crawl_jobs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "crawl_jobs_project_id_created_at_idx" ON "crawl_jobs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "crawl_jobs_status_created_at_idx" ON "crawl_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "job_logs_job_id_created_at_idx" ON "job_logs"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "crawl_pages_company_id_collected_at_idx" ON "crawl_pages"("company_id", "collected_at");

-- CreateIndex
CREATE INDEX "crawl_pages_company_id_url_idx" ON "crawl_pages"("company_id", "url");

-- CreateIndex
CREATE INDEX "crawl_pages_job_id_idx" ON "crawl_pages"("job_id");

-- CreateIndex
CREATE INDEX "company_snapshots_company_id_collected_at_idx" ON "company_snapshots"("company_id", "collected_at");

-- CreateIndex
CREATE INDEX "company_changes_company_id_observed_at_idx" ON "company_changes"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "company_changes_kind_idx" ON "company_changes"("kind");

-- CreateIndex
CREATE INDEX "reviews_company_id_published_at_idx" ON "reviews"("company_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_company_id_content_hash_key" ON "reviews"("company_id", "content_hash");

-- CreateIndex
CREATE INDEX "review_summaries_company_id_observed_at_idx" ON "review_summaries"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "review_themes_company_id_idx" ON "review_themes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_themes_company_id_theme_polarity_key" ON "review_themes"("company_id", "theme", "polarity");

-- CreateIndex
CREATE INDEX "offerings_company_id_idx" ON "offerings"("company_id");

-- CreateIndex
CREATE INDEX "offerings_normalized_idx" ON "offerings"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "offerings_company_id_kind_normalized_key" ON "offerings"("company_id", "kind", "normalized");

-- CreateIndex
CREATE INDEX "price_observations_company_id_observed_at_idx" ON "price_observations"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "price_observations_offering_id_observed_at_idx" ON "price_observations"("offering_id", "observed_at");

-- CreateIndex
CREATE INDEX "social_profiles_company_id_idx" ON "social_profiles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_company_id_platform_url_key" ON "social_profiles"("company_id", "platform", "url");

-- CreateIndex
CREATE INDEX "social_snapshots_profile_id_observed_at_idx" ON "social_snapshots"("profile_id", "observed_at");

-- CreateIndex
CREATE INDEX "website_metrics_company_id_observed_at_idx" ON "website_metrics"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "seo_metrics_company_id_observed_at_idx" ON "seo_metrics"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "company_images_company_id_category_idx" ON "company_images"("company_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "company_images_company_id_url_key" ON "company_images"("company_id", "url");

-- CreateIndex
CREATE INDEX "commercial_signals_company_id_observed_at_idx" ON "commercial_signals"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "competitive_metrics_project_id_computed_at_idx" ON "competitive_metrics"("project_id", "computed_at");

-- CreateIndex
CREATE INDEX "competitive_metrics_company_id_computed_at_idx" ON "competitive_metrics"("company_id", "computed_at");

-- CreateIndex
CREATE INDEX "data_quality_scores_company_id_computed_at_idx" ON "data_quality_scores"("company_id", "computed_at");

-- CreateIndex
CREATE INDEX "alerts_organization_id_status_idx" ON "alerts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "alerts_project_id_created_at_idx" ON "alerts"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_project_id_dedupe_key_key" ON "alerts"("project_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "insights_project_id_kind_idx" ON "insights"("project_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "insights_project_id_dedupe_key_key" ON "insights"("project_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "recommendations_project_id_priority_idx" ON "recommendations"("project_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_project_id_dedupe_key_key" ON "recommendations"("project_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "reports_project_id_created_at_idx" ON "reports"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_organization_id_collected_at_idx" ON "evidence"("organization_id", "collected_at");

-- CreateIndex
CREATE INDEX "evidence_company_id_collected_at_idx" ON "evidence"("company_id", "collected_at");

-- CreateIndex
CREATE INDEX "ai_analyses_project_id_created_at_idx" ON "ai_analyses"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_analyses_organization_id_created_at_idx" ON "ai_analyses"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "robots_cache_host_key" ON "robots_cache"("host");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "crawl_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "crawl_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_snapshots" ADD CONSTRAINT "company_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_changes" ADD CONSTRAINT "company_changes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_changes" ADD CONSTRAINT "company_changes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "company_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_changes" ADD CONSTRAINT "company_changes_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_summaries" ADD CONSTRAINT "review_summaries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_summaries" ADD CONSTRAINT "review_summaries_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_snapshots" ADD CONSTRAINT "social_snapshots_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_metrics" ADD CONSTRAINT "website_metrics_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_metrics" ADD CONSTRAINT "seo_metrics_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_images" ADD CONSTRAINT "company_images_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_images" ADD CONSTRAINT "company_images_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_signals" ADD CONSTRAINT "commercial_signals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_signals" ADD CONSTRAINT "commercial_signals_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitive_metrics" ADD CONSTRAINT "competitive_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitive_metrics" ADD CONSTRAINT "competitive_metrics_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_scores" ADD CONSTRAINT "data_quality_scores_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
