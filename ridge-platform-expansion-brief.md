# Ridge Platform Expansion Brief

**Prepared for:** Owen Fitzgerald, CEO/Founder, Ridge
**Platform:** platform.joinridge.co (v2.1.0)
**Date:** April 2026
**Classification:** Internal — Strategic and Confidential
**Version:** 2.0

---

# Ridge Platform Expansion Brief
## Section A: Platform Audit

*Audit basis: live browser inspection of platform.joinridge.co, full codebase review (index.html 3,868 lines, api/index.js 499 lines), database schema analysis, and marketing site review. Conducted against v2.1.0.*

---

## A.1 Executive Summary

Ridge is a strategy generator with a real-time intelligence overlay. It is not yet a sales intelligence system, and it is not, by any reasonable definition, a "full AI SDR deployment." The delta between what the marketing site promises and what the product delivers is the most significant risk facing the company today — not a technical limitation, not a competitive gap, but a credibility one.

That said, the core of what Ridge has built is genuinely strong. The Strategy Engine — a two-part AI pipeline producing 11 structured sections with ICP scoring, quality benchmarks, and copy-ready outbound messaging — is production-quality output. The Intelligence Feed, which runs multi-query web searches, scores signal relevance, and generates draft outreach from individual signals, is a differentiated capability that most tools in this category do not offer. These two systems form a real foundation.

The honest capability picture is this:

| Capability Layer | Status | Evidence |
|---|---|---|
| **Ingest** | Strong | Website scanner, meeting notes import, structured 6-section intake form, intelligence scan |
| **Reason** | Strong | 11-section strategy generation, ICP scoring, signal relevance scoring, outreach draft generation |
| **Activate** | Absent | No message sending, no sequence execution, no meeting booking, no CRM sync, no HeyReach integration |

The Activate layer does not exist in the codebase. Not as a stub, not as a placeholder — it is architecturally absent. Every user action that touches outbound ends at a drafted message in a text box. The platform has no mechanism to send anything.

---

## A.2 Technical Architecture

### Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 SPA | Single `index.html` (3,868 lines), in-browser Babel transpilation |
| API | Node.js serverless function | Single file: `api/index.js` (499 lines) |
| Infrastructure | Vercel Hobby plan | 10-second function timeout ceiling |
| Database | Neon PostgreSQL | 7 tables |
| CDN | unpkg.com | React UMD builds |
| Fonts | DM Sans + JetBrains Mono | |
| AI — fast operations | Claude Haiku 4.5 | |
| AI — strategy | Claude Sonnet 4.5 | |
| AI — fallback | GPT-4o, GPT-4o-mini | |
| AI — web search | Anthropic `web_search` tool | Fallback: `gpt-4o-search-preview` |
| Auth | Email/password + Google OAuth | |
| Deployment | Auto-deploy from GitHub (`owen543/ridge-strategy-engine`) | |

### Architecture Assessment

The current architecture is appropriate for a zero-to-one prototype. It is not appropriate for a commercially deployed product at the price points Ridge is marketing ($2,500–$10,000/month).

**In-browser Babel transpilation** means every user downloads and executes the build toolchain on page load. There is no code splitting, no tree shaking, and no production optimization. This is the development-mode React experience shipped to customers. For a tool used by sales teams doing active work sessions, this creates avoidable load time and runtime overhead.

**Single serverless function on Vercel Hobby** introduces a hard 10-second execution ceiling on all AI calls. The strategy generation pipeline makes two sequential AI calls (Sonnet 4.5) with web search. On degraded network conditions or under Anthropic API load, this ceiling will be hit. The code handles 429 rate-limit errors with one retry and a 5-second delay — which itself consumes half the available timeout window before retry work even begins.

**No build step** means the entire application is one monolithic file. As the codebase grows, this will become difficult to maintain, impossible to test in isolation, and slow to iterate on.

These are not hypothetical risks. They are active constraints that will surface when Ridge moves from a handful of manually managed workspaces to a live multi-tenant product.

---

## A.3 Database Schema

The database has 7 tables:

| Table | Primary Key | Key Columns |
|---|---|---|
| `users` | `id TEXT` | `email`, `password_hash`, `name`, `role`, `workspace_id`, `created_at` |
| `sessions` | `token TEXT` | `user_id`, `created_at` |
| `workspaces` | `id TEXT` | `name`, `website`, `status`, `type`, `intake_count`, `runs_count`, `client_email`, `is_client INT`, `notes` |
| `intake_data` | `workspace_id TEXT` | `data TEXT` (JSON blob), `updated_at` |
| `strategy_data` | `workspace_id TEXT` | `data TEXT` (JSON blob), `updated_at` |
| `settings` | `key TEXT` | `value TEXT` |
| `intelligence_data` | `workspace_id TEXT` | `signals TEXT` (JSON), `dismissed TEXT` (JSON), `drafts TEXT` (JSON), `last_scan_at`, `scan_count INT`, `updated_at` |

### Schema Issues

**JSON blobs as primary storage.** Both `intake_data` and `strategy_data` store all content as opaque JSON strings in a single `TEXT` column. This means:

- No field-level querying across workspaces (e.g., "show all workspaces targeting mid-market SaaS")
- No indexing on any intake or strategy field
- No aggregate analytics on intake or strategy data
- Schema changes require application-level migration of JSON strings

This is a meaningful limitation. It means Ridge cannot, today, run any cross-workspace analysis on the data it has collected — which is the foundation of the pattern recognition and benchmarking capabilities described in the expansion brief.

**No strategy versioning.** `strategy_data` uses `workspace_id` as a primary key with an upsert pattern. Each strategy regeneration overwrites the previous. There is no version history, no diff capability, no ability to compare iterations. For a product that bills itself on iterative AI strategy refinement, this is a significant gap.

**No target account table.** Despite a nav item labeled "Accounts," there is no `accounts` table. The nav item routes to user account management (creating/deleting Ridge users), not target account management. Account-level data exists only as embedded JSON within the intake form. This is a naming collision that will confuse clients.

**`intake_count` never increments.** The `workspaces` table has an `intake_count INT` column. A review of the intake POST handler (`api/index.js`) confirms this counter is never updated. The field reads zero for all workspaces regardless of intake history.

**Password hashing is SHA-256.** Production password storage requires adaptive hashing (bcrypt, Argon2, or scrypt). SHA-256 is not suitable for password hashing — it is fast by design, making brute-force attacks computationally cheap. This is a security requirement for any commercially deployed product.

**Google OAuth JWT is not verified.** The Google OAuth handler extracts the user payload from the JWT but does not verify the token signature. An attacker with a structurally valid but unsigned or forged JWT could authenticate as any Google-associated email. This needs to be fixed before customer-facing deployment.

**Session tokens stored in memory only.** Sessions are not persisted to localStorage. This was noted in the code as a sandboxed iframe concern. In practice, it means every page refresh requires re-authentication. For a tool used in active sales workflows, this is a friction point.

---

## A.4 API Surface

All routes are handled in a single 499-line file (`api/index.js`):

| Group | Routes |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`, `POST /api/auth/google` |
| Users | `GET /api/users`, `POST /api/users`, `DELETE /api/users`, `POST /api/users/password` |
| Workspaces | `GET /api/workspaces`, `POST /api/workspaces`, `PUT /api/workspaces`, `DELETE /api/workspaces` |
| Data | `GET/POST /api/intake`, `GET/POST /api/strategy`, `GET/POST /api/settings`, `GET/POST /api/intelligence` |
| AI | `POST /api/ai` (9 actions) |
| Seed | `POST /api/seed` |
| Health | `GET /api/health` |

The AI endpoint handles 9 distinct actions: `health`, `scan_website`, `extract_notes`, `strategy_part_a`, `strategy_part_b`, `summarize_section`, `scan_intelligence`, `draft_outreach`, `market_pulse`.

### API Issues

**No rate limiting.** Any authenticated user can call `POST /api/ai` without throttling. At $3–15 per strategy generation (estimated Anthropic API costs for Sonnet 4.5 calls with web search), an unmetered client could generate significant costs with no ceiling. At scale, this is a direct cost-to-revenue risk.

**No input validation.** The intake form has no field-level validation enforced on the API. ICP size ranges can be submitted with minimum greater than maximum. Malformed data can enter the database without rejection.

**No audit logging.** There is no record of who accessed what data, when strategy was generated, or when client portal was viewed. For a product handling sensitive go-to-market data, this is a compliance gap.

**No RBAC beyond binary role.** Authorization is a two-state check: `ridge_admin` or `client`. There is no workspace-scoped permissions model, no read/write distinction, and no team-level access control. This works for a two-person consulting operation. It does not work for a multi-team product.

**Seed endpoint is unauthenticated or weakly guarded.** `POST /api/seed` should be reviewed before any production deployment to confirm it cannot be triggered by unauthorized parties.

---

## A.5 Frontend Architecture

### Routing and Component Structure

```
LoginScreen
├── AdminDashboard (role: ridge_admin)
│   ├── Sidebar
│   │   ├── Workspaces (always visible)
│   │   ├── Intake (workspace-scoped)
│   │   ├── Strategy (workspace-scoped)
│   │   ├── Intelligence (workspace-scoped)
│   │   └── Accounts (always visible)
│   ├── WorkspacesView
│   └── WorkspaceDetail
│       ├── IntakeForm
│       ├── StrategyGenerator + StrategyView
│       └── IntelligenceFeed
└── ClientDashboard (role: client)
    ├── Sidebar (Overview, Intake, Strategy, Intelligence)
    └── ClientPortal
```

The application uses React 18 with in-browser Babel. There is no bundler, no module system, and no component library. All 3,868 lines of UI code live in a single HTML file.

### What Works (verified in live audit)

| Feature | Status | Notes |
|---|---|---|
| Login (email/password + Google OAuth) | Working | Google OAuth signature check absent |
| Workspace CRUD | Working | No deduplication guard |
| Intake form (6 collapsible sections, auto-save) | Working | Counter bug; no field validation |
| Website Scanner (AI-powered) | Working | Uses Anthropic web_search |
| Meeting Notes import (Circleback) | Working | Dropdown present; paste import |
| Strategy generation (2-part AI → 11 sections) | Working | Upsert pattern; no versioning |
| 11-tab strategy viewer with inline editing | Working | Editing on Decision-Maker tab only |
| Intelligence Feed (multi-query scan, signal cards) | Working | 48 signals on populated workspace |
| Signal dismissal and filtering | Working | |
| Draft Outreach from signals | Working | Generates connection note, LinkedIn, email |
| Market Pulse (live S&P 500, NASDAQ, 10Y, VIX) | Working | |
| Theme toggle (dark/light) | Working | |
| Account management (create/reset/delete) | Working | Misnamed as "Accounts" nav item |
| Client Portal (read-only strategy view) | Working | |
| Status bar (version, online status, clock) | Working | v2.1.0 |

### What Is Broken or Incomplete

| Issue | Severity | Evidence |
|---|---|---|
| `intake_count` never increments | Medium | POST handler in `api/index.js` does not update workspace counter |
| No input validation on intake fields | Medium | ICP size min > max allowed; no rejection at API |
| No workspace deduplication | Low-Medium | 3 duplicate "Arunjay" workspaces exist in live platform |
| No strategy versioning | High | 1:1 upsert overwrites all prior versions |
| "Accounts" nav routes to user management, not target accounts | Medium | Naming collision; will confuse clients |
| In-browser Babel: no production optimization | Medium | Entire React toolchain runs in browser |
| Vercel Hobby 10s timeout on AI calls | High | Two Sonnet 4.5 calls + web search can exceed this |
| Session tokens in memory only (no persistence) | Medium | Refresh requires re-authentication |
| SHA-256 password hashing | High | Not suitable for production credential storage |
| Google OAuth JWT signature not verified | High | Potential authentication bypass |
| No RBAC beyond binary role | Medium | No workspace-scoped or team-level permissions |
| No audit logging | Medium | No access or action history |
| No API rate limiting | High | Unbounded AI endpoint cost exposure |
| No HeyReach integration | Critical (vs. marketing claims) | Not in codebase; HeyReach mentioned in marketing |
| No message sending capability | Critical (vs. marketing claims) | Entire Activate layer absent |

---

## A.6 Live Platform State

At the time of audit, the live platform at `platform.joinridge.co` showed:

- **4 workspaces**: 1 named "palantir," 3 duplicates named "Arunjay"
- **2 admin accounts**: Owen, Jack
- **1 completed strategy**: on the Arunjay workspace
- **48 intelligence signals**: on the populated workspace
- **0 client-facing deployments** with active billing observed

The duplicate workspace issue is a symptom of no deduplication logic — the same client has been onboarded three times with no system-level prevention. At current scale (4 workspaces), this is an inconvenience. At 50+ workspaces, it becomes a data integrity problem.

The one completed strategy and the intelligence feed with 48 signals are the strongest evidence of what the system can actually do. They demonstrate that the Ingest → Reason pipeline works end-to-end and produces genuinely useful output.

---

## A.7 Marketing Claims vs. Product Reality

This section documents the gap between what Ridge's marketing site asserts and what the product delivers. This is not an indictment of the team's ambition — it is a factual record that must be resolved before Ridge can scale without reputational risk.

| Marketing Claim | Product Reality | Gap Type |
|---|---|---|
| "AI That Books Sales Qualified Meetings at Scale" | Product generates strategies; it does not book meetings | Fundamental misrepresentation |
| "800+ Messages per month" | No message sending capability exists in the codebase | Fabricated capability |
| "90% Show up rate" | No meeting tracking, no attendance data, no feedback loop | Fabricated metric |
| "Full AI SDR deployment" | Product is a strategy generator and intelligence tool | Category misrepresentation |
| "Trained AI agents matched to your ICP" | No autonomous agents; all AI calls are synchronous, user-triggered | Misleading framing |
| "$2,500/mo, $5,000/mo, $10,000/mo pricing tiers" | No billing, no payment processing, no usage metering, no tier enforcement | Not implemented |
| "100+ integrations" | Zero live integrations; one paste-import from Circleback | Off by two orders of magnitude |
| HeyReach integration | Not present in codebase | Not built |

### The Core Problem

Ridge's marketing describes a fully deployed outbound machine. The product is a sophisticated planning tool. These are different things. A planning tool can be excellent and commercially valuable — but it must be sold as what it is.

The specific failure mode to avoid: a client at the $5,000/month tier signs based on "AI That Books Meetings at Scale," completes the intake form, reviews the strategy, and then asks how to connect to their outbound tool. The answer today is: you can't. That is a churn event with reputational damage attached.

There are two legitimate paths to closing this gap:

1. **Pull back the marketing** to accurately describe what Ridge is: an AI-powered sales strategy and intelligence platform. This is defensible, genuinely differentiated, and can command premium pricing.

2. **Build the Activate layer** that closes the loop between strategy and execution — message sending, sequencing, CRM sync, and outcome tracking. This is the scope of the remaining sections of this brief.

The current positioning — aspirational claims backed by a prototype infrastructure — is the path most likely to produce churn, refund requests, and reputational damage that is difficult to recover from.

---

## A.8 Capability Audit: Ingest, Reason, Activate

### Ingest (Strong)

The platform's data collection surface is genuinely capable:

- **Website Scanner**: Uses Anthropic `web_search` to extract company positioning, ICP signals, and market context from a URL. Output is pre-populated into the intake form.
- **Meeting Notes Import**: A Circleback-connected dropdown allows paste import of meeting transcripts, which are processed by `extract_notes` (Haiku 4.5) to populate intake fields.
- **Structured Intake Form**: 6 collapsible sections capturing company overview, ICP definition, competitive landscape, product differentiation, and outbound goals. Auto-saves on edit.
- **Intelligence Scan**: Multi-query web search using `scan_intelligence` action, returning scored signals with source attribution.

The intake pipeline is the most mature part of the product. For a strategy-focused tool, this is appropriate prioritization.

### Reason (Strong)

The strategy generation pipeline is the crown jewel of the current platform:

- **Two-part AI pipeline**: `strategy_part_a` (Sonnet 4.5) generates the first 5-6 sections; `strategy_part_b` (Sonnet 4.5) completes the remaining sections using Part A output as context.
- **11-section output**: The strategy viewer presents a tabbed interface covering ICP definition, messaging hierarchy, objection handling, decision-maker profiles, competitive positioning, outbound sequencing, and quality benchmarking.
- **Signal scoring**: Intelligence signals are scored for relevance; outreach drafts are generated per signal with channel-specific variants (LinkedIn connection note, LinkedIn message, email subject, email body).
- **Market Pulse**: Live financial data (S&P 500, NASDAQ, 10Y Treasury yield, VIX) provides ambient market context.

The quality of the AI output — particularly the 11-section strategy — is above what most point solutions in this category produce. The decision-maker profile inline editing feature suggests a path toward deeper customization that is not yet fully developed.

### Activate (Absent)

There is no Activate layer. The following capabilities do not exist in any form:

- **Message sending**: No outbound API calls to any messaging platform. Generated messages exist only as text in the UI.
- **Sequence execution**: No multi-step outbound sequences. No scheduling. No follow-up logic.
- **Meeting booking**: No calendar integration. No booking link generation. No meeting tracking.
- **CRM sync**: No Salesforce, HubSpot, or equivalent connection. No contact record creation or update.
- **HeyReach integration**: Listed on the marketing site; absent from the codebase entirely.
- **Outcome tracking**: No mechanism to record whether an outreach was sent, whether a meeting was booked, or whether it was attended.
- **Closed-loop learning**: No feedback path from outcomes back to strategy quality assessment.

This is not a partial implementation — it is an architectural absence. Building the Activate layer requires new infrastructure, not iteration on existing components.

---

## A.9 Infrastructure Risks and Scaling Constraints

### Vercel Hobby Plan

The Vercel Hobby plan imposes a **10-second function execution timeout**. The strategy generation flow makes two sequential Sonnet 4.5 calls with web search context. Under normal conditions this completes within the ceiling. Under Anthropic API congestion or cold-start conditions, it will fail.

The rate limit retry logic adds up to 5 seconds of delay before the retry attempt begins. In a 10-second window, this leaves 5 seconds for the actual AI call on retry — which is insufficient for a Sonnet-class model response.

Moving to Vercel Pro (60s timeout) or a dedicated compute environment is a prerequisite for any commercial deployment.

### Single-File Monolith

The current architecture — a 3,868-line HTML file and a 499-line API file — will not support the features described in the expansion brief without significant refactoring. Specifically:

- Adding the Activate layer requires new API routes, new database tables, webhook handling, and background job processing — none of which are appropriate for a single serverless function on Hobby.
- Integration with HeyReach, CRM platforms, or any external system requires credential storage, refresh token handling, and integration-specific error handling that cannot be maintained in a flat file.
- Background intelligence scanning (the kind that runs on a schedule, not on user click) requires a separate execution environment.

### Cost Exposure

With no rate limiting on `/api/ai`, each strategy generation call consumes Anthropic API credits without ceiling. At estimated costs for Sonnet 4.5 with web search context, a client who regenerates strategy repeatedly (or an API key leak) could generate hundreds of dollars in costs against a single workspace. This must be addressed before customer-facing billing is active.

---

## A.10 Summary Verdict

Ridge has built a real product with genuine differentiation in two of the three capability layers that matter. The Ingest and Reason layers work, produce high-quality output, and are more capable than most competitors in the strategy generation category.

The problems are equally real:

1. **The Activate layer does not exist.** Every marketing claim about meeting booking, message sending, and AI SDR deployment is currently fiction. This is the single largest product gap.

2. **The infrastructure is prototype-grade.** In-browser Babel, single serverless function, Hobby-plan timeout ceilings, SHA-256 password hashing, and unverified OAuth tokens are not appropriate for a paid commercial product.

3. **The database design limits future analytics.** JSON blob storage for intake and strategy data means Ridge cannot query across its own client data — a prerequisite for benchmarking, pattern recognition, and the intelligence features described in later sections.

4. **The marketing-product gap is a credibility risk.** Not a performance risk, not a technical risk — a trust risk with paying clients who will discover the gap immediately after onboarding.

The path forward is clear: close the marketing claims to match the current product, stabilize the infrastructure for commercial deployment, and build the Activate layer as the primary product investment. The remaining sections of this brief define what that build requires.

---

*Section A complete. Sections B–E to follow.*


---

# Ridge Platform Expansion Brief
## Sections B & C: The Ridge Ontology and The Ridge Application Suite

---

# SECTION B — THE RIDGE ONTOLOGY

## B.1 Architecture Philosophy

The Ridge Ontology is a workspace-scoped, semantically versioned object graph that serves as the single source of truth for every application in the Ridge suite. No application owns its data. Every application reads from and writes back to the same graph. This design principle — borrowed and extended from Palantir's Ontology Layer — means that each new application added to the suite increases the value of every existing application rather than creating a competing data silo.

The ontology is organized into three layers:

---

### Layer 1: Semantic Layer (Nouns and Verbs)

The Semantic Layer defines what exists and how things relate. It comprises **object types** (the nouns: Organizations, Contacts, Signals, Meetings) and **link types** (the verbs: *targets*, *has_contact*, *triggered_by*, *closes_against*). The Semantic Layer is declared in a schema registry and is semantically versioned — breaking changes require a major version bump and a migration path. Applications reference schema versions explicitly, so a breaking change to the Organization object type does not silently corrupt a downstream app.

The Semantic Layer has no runtime behavior. It is pure structure: property definitions, cardinality constraints, and link type declarations. The object graph at any point in time is a materialized instance of the Semantic Layer schema applied to stored data.

---

### Layer 2: Kinetic Layer (Actions and Functions)

The Kinetic Layer is where the ontology becomes defensible. It defines:

- **Actions** — write-back operations that create or mutate objects and links. Every write to the ontology happens through a declared action, never through raw SQL. Actions are typed (inputs, preconditions, side effects), audited via AuditEvent, and replayable. Example: `enroll_contact_in_sequence`, `score_thesis_fit`, `log_engagement`.
- **Functions** — read-only computed properties derived from the graph at query time without persisting to storage. Example: `committee_coverage_score(org_id)`, `sender_health_index(sender_account_id)`, `signal_recency_weighted_score(org_id)`.

The Kinetic Layer is the mechanism by which Ridge moves from passive display to active intelligence. A read-only dashboard shows a Function result. A write-back button invokes an Action. The Action is what creates proprietary data — the irreversible accumulation of behavioral and outcome signal that no competitor can replicate.

---

### Layer 3: Dynamic Layer (Orchestration)

The Dynamic Layer orchestrates the Kinetic Layer over time. It comprises:

- **Workflows** — multi-step sequences of Actions triggered by user input or system events. A workflow has preconditions, steps, branching logic, and terminal states. Example: `qualify_and_brief_account` triggers intake enrichment, committee mapping, thesis scoring, and brief generation in sequence.
- **Alerts** — subscriptions to object state changes or Function threshold crossings. Example: alert when `signal_recency_weighted_score(org_id)` crosses a user-configured threshold, or when a Contact's `seniority_level` changes to `ECONOMIC_BUYER`.
- **Schedules** — time-based invocations of Actions or Workflows. Example: weekly re-enrichment of Signals for all Organizations in an active Pipeline stage.

The Dynamic Layer is what separates a database with a UI from an operating system for a sales team. Without it, the ontology is a record store. With it, Ridge becomes a system that anticipates, not just records.

---

## B.2 Object Types

> Notation: `uuid` fields are system-generated primary keys. `ts` denotes UTC timestamp. Status values represent the complete finite state machine for each object type. Write-back sources identify which applications or actions produce writes.

---

### 1. Organization

**Why it matters:** The foundational anchor of every workflow — all intelligence, sequences, and pipeline stages attach here.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | string | Legal or trade name |
| `domain` | string | Primary web domain; used as deduplication key |
| `aliases` | string[] | Trade names, former names, DBA |
| `industry` | string | SIC/NAICS industry code + label |
| `sub_industry` | string | More specific vertical tag |
| `employee_count` | integer | Current headcount estimate |
| `revenue_estimate` | integer | ARR or revenue estimate (USD) |
| `hq_country` | string | ISO 3166-1 alpha-2 |
| `hq_city` | string | City of headquarters |
| `tech_stack` | string[] | Detected technologies (from enrichment) |
| `funding_stage` | enum | BOOTSTRAPPED, SEED, SERIES_A … PUBLIC |
| `funding_total_usd` | integer | Total capital raised |
| `last_funding_date` | date | Date of most recent funding event |
| `icp_score` | float | Ideal customer profile fit, 0.0–1.0 |
| `thesis_fit_score` | float | Thesis Engine computed score, 0.0–1.0 |
| `account_tier` | enum | TIER_1, TIER_2, TIER_3, UNRANKED |
| `enrichment_source` | string | Provider that last populated enrichment fields |
| `enrichment_last_at` | ts | Timestamp of last enrichment run |
| `created_at` | ts | Record creation time |
| `updated_at` | ts | Last mutation time |
| `workspace_id` | uuid | Owning workspace |

**Status values:** `PROSPECT`, `ACTIVE_TARGET`, `IN_SEQUENCE`, `MEETING_BOOKED`, `IN_PIPELINE`, `CLOSED_WON`, `CLOSED_LOST`, `DISQUALIFIED`, `DORMANT`

**Write-back sources:** Accounts app (manual create, tier assignment), Intake Engine (ICP scoring), Thesis Engine (thesis_fit_score), Intelligence Feed (enrichment refresh), Signal Monitor (status transitions), Committee Map (enrichment)

---

### 2. Contact

**Why it matters:** Buying committees are won at the person level; the richest signal in the graph is behavioral data attached to individual contacts.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `organization_id` | uuid | FK → Organization |
| `first_name` | string | Given name |
| `last_name` | string | Surname |
| `email` | string | Primary business email |
| `email_status` | enum | VALID, RISKY, INVALID, UNKNOWN |
| `linkedin_url` | string | Canonical LinkedIn profile URL |
| `title` | string | Current job title |
| `seniority_level` | enum | IC, MANAGER, DIRECTOR, VP, C_SUITE, BOARD, UNKNOWN |
| `department` | enum | SALES, MARKETING, FINANCE, ENGINEERING, OPERATIONS, HR, LEGAL, EXEC, OTHER |
| `buying_role` | enum | ECONOMIC_BUYER, CHAMPION, INFLUENCER, BLOCKER, USER, UNKNOWN |
| `committee_tier` | enum | PRIMARY, SECONDARY, PERIPHERAL |
| `persona_tag` | string | Taxonomy label from Committee Map |
| `warm_path_score` | float | Strength of warm introduction path, 0.0–1.0 |
| `engagement_count` | integer | Computed: number of Engagements linked |
| `last_engaged_at` | ts | Most recent engagement timestamp |
| `opted_out` | boolean | Unsubscribe or DNC flag |
| `opted_out_at` | ts | Timestamp of opt-out |
| `enrichment_source` | string | Provider of enrichment data |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `UNCONTACTED`, `IN_SEQUENCE`, `ENGAGED`, `REPLIED`, `MEETING_BOOKED`, `DISQUALIFIED`, `OPTED_OUT`

**Write-back sources:** Committee Map (buying_role, committee_tier, warm_path_score), Sender Intelligence (engagement data), Accounts app (manual create), Loop (engagement_count updates)

---

### 3. Workspace

**Why it matters:** The permission and tenancy boundary — every object in the graph is workspace-scoped, enabling multi-client isolation and Atlas-layer aggregation.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | string | Client or team display name |
| `slug` | string | URL-safe identifier |
| `tier` | enum | STARTER, GROWTH, ENTERPRISE |
| `owner_user_id` | uuid | FK → user who created workspace |
| `settings` | jsonb | Feature flags, defaults, preferences |
| `atlas_eligible` | boolean | Whether workspace data feeds Atlas aggregations |
| `created_at` | ts | Creation timestamp |
| `deactivated_at` | ts | Soft-delete timestamp |

**Status values:** `ACTIVE`, `SUSPENDED`, `DEACTIVATED`

**Write-back sources:** Platform admin (create, tier change), Team app (settings mutations)

---

### 4. Intake

**Why it matters:** Structured client context is the seed from which all AI outputs grow — garbage in, garbage strategy out.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `version` | integer | Monotonic version counter per workspace |
| `company_name` | string | Client's company name |
| `product_description` | text | What the client sells |
| `icp_description` | text | Free-text ICP narrative |
| `icp_structured` | jsonb | Parsed ICP dimensions: firmographics, technographics, triggers |
| `value_propositions` | string[] | Ordered list of client's stated value props |
| `objections` | string[] | Common objections and rebuttals |
| `competitors` | string[] | Named competitors |
| `win_themes` | string[] | Themes from historical wins |
| `exclusions` | string[] | Explicitly excluded verticals or company types |
| `tone_preference` | enum | FORMAL, CONVERSATIONAL, CHALLENGER, PEER |
| `completed_at` | ts | When the intake form was submitted |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `DRAFT`, `SUBMITTED`, `PROCESSING`, `COMPLETE`, `STALE`

**Write-back sources:** Intake Engine (form submission, AI enrichment), Strategy Engine (stale detection), Thesis Engine (win theme extraction)

---

### 5. Strategy

**Why it matters:** The original core output — the 11-section AI-generated strategy — is now one application's output artifact, not the product itself.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `intake_id` | uuid | FK → Intake that seeded this strategy |
| `version` | integer | Monotonic version per workspace |
| `sections` | jsonb | Keyed object: 11 section payloads |
| `model_version` | string | AI model identifier used for generation |
| `generation_prompt_hash` | string | SHA-256 of prompt used; enables reproducibility |
| `generated_at` | ts | Generation timestamp |
| `approved_by` | uuid | User who approved for deployment |
| `approved_at` | ts | Approval timestamp |
| `deprecated_at` | ts | Superseded by newer version |
| `created_at` | ts | Record creation |

**Status values:** `GENERATING`, `DRAFT`, `APPROVED`, `ACTIVE`, `DEPRECATED`

**Write-back sources:** Strategy Engine (generation, approval), Intake Engine (triggers regeneration on intake change), Playbook (instantiation from template)

---

### 6. Signal

**Why it matters:** Signals are the raw material of trigger-based selling — without a structured signal store, every team manually monitors noise.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `organization_id` | uuid | FK → Organization the signal concerns |
| `signal_type` | enum | See signal type taxonomy below |
| `source` | string | Originating data source (e.g., `linkedin_feed`, `news_api`, `job_board`) |
| `source_url` | string | URL of original signal document |
| `headline` | string | Human-readable signal summary, ≤140 chars |
| `detail` | text | Full extracted signal text |
| `relevance_score` | float | Model-assigned relevance to workspace ICP, 0.0–1.0 |
| `urgency_score` | float | Time-decay weighted urgency, 0.0–1.0 |
| `triggered_alert` | boolean | Whether this signal fired an Alert |
| `alert_id` | uuid | FK → Alert (if triggered) |
| `raw_payload` | jsonb | Original API payload for audit/replay |
| `detected_at` | ts | When signal was detected |
| `expires_at` | ts | When signal is considered stale |
| `created_at` | ts | Record creation |

**Signal type taxonomy:** `FUNDING_ROUND`, `LEADERSHIP_CHANGE`, `HEADCOUNT_GROWTH`, `HEADCOUNT_REDUCTION`, `TECH_ADOPTION`, `TECH_DEPARTURE`, `REGULATORY_FILING`, `EARNINGS_MISS`, `EARNINGS_BEAT`, `M_AND_A`, `NEW_PRODUCT_LAUNCH`, `EXPANSION_ANNOUNCEMENT`, `CONTRACT_WIN`, `CONTRACT_LOSS`, `JOB_POSTING_SURGE`, `COMPETITOR_MENTION`

**Status values:** `NEW`, `REVIEWED`, `ACTIONED`, `DISMISSED`, `EXPIRED`

**Write-back sources:** Signal Monitor (ingestion, scoring), Intelligence Feed (display, dismiss), Loop (outcome linkage)

---

### 7. Sequence

**Why it matters:** Without a sequence object in the ontology, Ridge cannot measure which messaging approaches correlate with outcomes — the write-back loop breaks.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `organization_id` | uuid | FK → Organization being targeted |
| `strategy_id` | uuid | FK → Strategy that generated this sequence |
| `playbook_id` | uuid | FK → Playbook template (if instantiated from one) |
| `name` | string | Human label |
| `channel` | enum | LINKEDIN, EMAIL, MULTITOUCH |
| `step_count` | integer | Total steps in sequence |
| `heyreach_sequence_id` | string | External ID in HeyReach for sync |
| `launched_at` | ts | When sequence was activated |
| `completed_at` | ts | When sequence reached terminal state |
| `paused_at` | ts | If sequence is paused |
| `active_contact_count` | integer | Current enrolled contacts |
| `reply_count` | integer | Total replies received |
| `meeting_count` | integer | Meetings attributed to this sequence |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED`

**Write-back sources:** Strategy Engine (sequence draft generation), Sender Intelligence (health-gated activation), Loop (outcome attribution updates)

---

### 8. Message

**Why it matters:** The atomic unit of a sequence — Message-level data is where angle performance is measured and where Loop learns.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `sequence_id` | uuid | FK → Sequence |
| `contact_id` | uuid | FK → Contact recipient |
| `step_number` | integer | Position in sequence |
| `channel` | enum | LINKEDIN, EMAIL |
| `subject` | string | Email subject or connection request note label |
| `body` | text | Full message body |
| `angle_tag` | string | Strategic angle label (e.g., `pain_cost`, `social_proof`, `trigger_event`) |
| `personalization_tokens` | jsonb | Variable substitutions applied |
| `sender_account_id` | uuid | FK → SenderAccount |
| `heyreach_message_id` | string | External message ID for sync |
| `sent_at` | ts | Delivery timestamp |
| `delivered` | boolean | Delivery confirmation |
| `created_at` | ts | Record creation |

**Status values:** `DRAFT`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED`

**Write-back sources:** Strategy Engine (draft generation), Sender Intelligence (sender assignment), HeyReach sync (sent_at, delivered)

---

### 9. Engagement

**Why it matters:** The closed-loop signal — without Engagement records, Ridge cannot tell which sequences, angles, or signals drove outcomes.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `message_id` | uuid | FK → Message (if tied to a message) |
| `contact_id` | uuid | FK → Contact |
| `sequence_id` | uuid | FK → Sequence |
| `organization_id` | uuid | FK → Organization |
| `engagement_type` | enum | OPEN, CLICK, REPLY, CONNECTION_ACCEPTED, MEETING_BOOKED, UNSUBSCRIBE |
| `channel` | enum | LINKEDIN, EMAIL |
| `reply_text` | text | Verbatim reply (if engagement_type = REPLY) |
| `sentiment` | enum | POSITIVE, NEUTRAL, NEGATIVE, NOT_NOW, UNKNOWN |
| `sentiment_confidence` | float | Model confidence in sentiment classification |
| `occurred_at` | ts | When engagement happened |
| `source` | string | System that reported the engagement |
| `created_at` | ts | Record creation |

**Status values:** N/A (Engagements are immutable event records)

**Write-back sources:** HeyReach webhook sync, Loop (sentiment classification backfill)

---

### 10. Meeting

**Why it matters:** The terminal event of a successful sales intelligence workflow — Meeting objects close the attribution loop from signal to booked conversation.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `organization_id` | uuid | FK → Organization |
| `contact_id` | uuid | FK → primary Contact attendee |
| `sequence_id` | uuid | FK → Sequence that drove the booking |
| `pipeline_id` | uuid | FK → Pipeline (if meeting advances a deal) |
| `meeting_type` | enum | DISCOVERY, DEMO, FOLLOW_UP, CLOSE, ADVISORY |
| `status` | enum | SCHEDULED, COMPLETED, NO_SHOW, CANCELLED, RESCHEDULED |
| `scheduled_at` | ts | Scheduled time |
| `completed_at` | ts | Actual completion time |
| `duration_minutes` | integer | Length in minutes |
| `source` | string | Booking system (e.g., Calendly, HubSpot) |
| `notes` | text | Post-meeting notes |
| `outcome` | enum | PROGRESSED, STALLED, LOST, WON |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `SCHEDULED`, `COMPLETED`, `NO_SHOW`, `CANCELLED`, `RESCHEDULED`

**Write-back sources:** Integration sync (calendar/CRM), Command Center (manual log), Loop (outcome attribution)

---

### 11. Pipeline

**Why it matters:** Without pipeline-stage tracking in the ontology, Ridge cannot compute which ICP segments, strategies, or signals produce revenue — the Atlas layer has no ground truth.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `organization_id` | uuid | FK → Organization |
| `name` | string | Deal or opportunity name |
| `stage` | enum | QUALIFIED, DISCOVERY, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST |
| `value_usd` | integer | Estimated deal value |
| `close_date` | date | Expected close date |
| `probability` | float | Win probability, 0.0–1.0 |
| `owner_user_id` | uuid | FK → user owning this pipeline entry |
| `crm_id` | string | External CRM record ID for sync |
| `source_meeting_id` | uuid | FK → first Meeting that opened this pipeline |
| `won_at` | ts | Close won timestamp |
| `lost_at` | ts | Close lost timestamp |
| `lost_reason` | string | Loss reason category |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `QUALIFIED`, `DISCOVERY`, `PROPOSAL`, `NEGOTIATION`, `CLOSED_WON`, `CLOSED_LOST`

**Write-back sources:** Accounts app (manual create, stage transitions), Integration sync (CRM), Command Center (stage updates), Loop (outcome recording)

---

### 12. Playbook

**Why it matters:** Reusable strategy templates are the mechanism by which Ridge's institutional learning compounds — a won deal pattern can be codified and replicated at scale.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | Owning workspace (NULL if platform-level) |
| `name` | string | Playbook display name |
| `description` | text | Intended use case |
| `vertical_tag` | string | Industry vertical this playbook targets |
| `icp_parameters` | jsonb | Pre-configured ICP dimensions |
| `strategy_template` | jsonb | Strategy section scaffolding |
| `sequence_templates` | jsonb[] | Message step templates |
| `success_criteria` | jsonb | What outcome signals validate this playbook |
| `win_count` | integer | Number of pipeline wins attributed to this playbook |
| `usage_count` | integer | Number of times instantiated |
| `source_thesis_id` | uuid | FK → Thesis that generated this playbook |
| `is_platform_default` | boolean | Available to all workspaces if true |
| `created_by` | uuid | FK → User |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `DRAFT`, `ACTIVE`, `DEPRECATED`

**Write-back sources:** Thesis Engine (auto-generated from winning patterns), Strategy Engine (instantiation creates child Strategy), Atlas (platform-default promotion)

---

### 13. Team

**Why it matters:** Permission scoping within a workspace — a team structure enables client organizations to partition access without requiring separate workspaces.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `name` | string | Team display name |
| `role` | enum | ADMIN, EDITOR, VIEWER, SENDER |
| `member_user_ids` | uuid[] | Array of user IDs on this team |
| `permissions` | jsonb | Fine-grained permission flags by object type |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `ACTIVE`, `ARCHIVED`

**Write-back sources:** Workspace admin actions

---

### 14. SenderAccount

**Why it matters:** Sender reputation is a measurable, manageable asset — without a structured SenderAccount object, health degradation is invisible until deliverability collapses.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `platform` | enum | LINKEDIN, EMAIL |
| `identifier` | string | LinkedIn profile URL or email address |
| `display_name` | string | Sender display name |
| `heyreach_account_id` | string | HeyReach internal account ID |
| `health_score` | float | Computed sender health, 0.0–1.0 |
| `daily_send_limit` | integer | Maximum sends per day for this account |
| `daily_sent_today` | integer | Running count for today |
| `linkedin_connection_count` | integer | Current 1st-degree connections |
| `email_domain_age_days` | integer | Age of sending domain |
| `warmup_status` | enum | COLD, WARMING, WARMED |
| `last_health_check_at` | ts | Timestamp of most recent health evaluation |
| `suspended_at` | ts | If account has been restricted |
| `suspension_reason` | string | Reason for suspension if applicable |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `ACTIVE`, `WARMING`, `PAUSED`, `SUSPENDED`, `RETIRED`

**Write-back sources:** Sender Intelligence (health_score, warmup_status, suspension), HeyReach sync (usage data), Integration (account import)

---

### 15. Integration

**Why it matters:** The ontology's data quality ceiling is bounded by the richness of its integrations — Integration objects track connection health and enable the Dynamic Layer to self-heal.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `integration_type` | enum | HEYREACH, HUBSPOT, SALESFORCE, CALENDLY, APOLLO, LINKEDIN_API, CLEARBIT, OPENAI, WEBHOOK |
| `display_name` | string | User-assigned label |
| `credentials_ref` | string | Reference to encrypted credential store (not the credential itself) |
| `status` | enum | CONNECTED, DEGRADED, DISCONNECTED, REVOKED |
| `last_sync_at` | ts | Most recent successful sync timestamp |
| `last_error` | string | Most recent error message |
| `error_count` | integer | Consecutive error count (triggers alert if threshold crossed) |
| `sync_frequency_minutes` | integer | Configured sync interval |
| `metadata` | jsonb | Integration-specific configuration |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `CONNECTED`, `DEGRADED`, `DISCONNECTED`, `REVOKED`

**Write-back sources:** Integration setup workflow, health-check scheduler, Command Center (manual reconnect)

---

### 16. AuditEvent

**Why it matters:** Immutable, append-only activity log — required for enterprise compliance, SOC 2 preparation, and the debugging of AI-generated write-backs.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key (v7 UUID — time-sortable) |
| `workspace_id` | uuid | FK → Workspace |
| `actor_user_id` | uuid | FK → User who triggered the event (NULL if system) |
| `actor_type` | enum | USER, SYSTEM, INTEGRATION, AI_ACTION |
| `action_name` | string | Declared action name from Kinetic Layer |
| `object_type` | string | Target object type |
| `object_id` | uuid | Target object ID |
| `before_state` | jsonb | Object snapshot before mutation |
| `after_state` | jsonb | Object snapshot after mutation |
| `ip_address` | string | Request IP (user actions only) |
| `occurred_at` | ts | Event timestamp (immutable, set at write time) |

**Status values:** N/A (AuditEvents are immutable and have no lifecycle state)

**Write-back sources:** All Actions in the Kinetic Layer emit an AuditEvent automatically; this cannot be disabled.

---

### 17. Thesis

**Why it matters:** A Thesis encodes a client-specific, evidence-backed hypothesis about which characteristics predict a winnable opportunity — it is the highest-level unit of institutional knowledge in Ridge.

| Property | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK → Workspace |
| `name` | string | Human-readable thesis label |
| `hypothesis` | text | The stated hypothesis in plain language |
| `icp_filters` | jsonb | Firmographic, technographic, and trigger conditions |
| `signal_weights` | jsonb | Keyed signal_type → weight float |
| `angle_preferences` | string[] | Ordered preference list of message angle tags |
| `evidence_pipeline_ids` | uuid[] | FK[] → Pipeline wins that support this thesis |
| `evidence_win_count` | integer | Number of attributed wins |
| `confidence_score` | float | Statistical confidence in thesis, 0.0–1.0 |
| `version` | integer | Monotonic version for this thesis |
| `generated_by` | enum | USER, THESIS_ENGINE |
| `created_at` | ts | Record creation |
| `updated_at` | ts | Last mutation |

**Status values:** `DRAFT`, `ACTIVE`, `UNDER_REVIEW`, `DEPRECATED`

**Write-back sources:** Thesis Engine (generation, confidence score updates), Loop (win attribution), Playbook (thesis promotion to reusable template)

---

## B.3 Link Types

| # | Source | Relation | Target | Cardinality | Description |
|---|---|---|---|---|---|
| 1 | Organization | `has_contact` | Contact | One-to-many | A company has one or more contacts in its buying committee |
| 2 | Organization | `targeted_by` | Workspace | Many-to-many | One organization may be targeted by multiple workspaces (Atlas use case) |
| 3 | Organization | `has_signal` | Signal | One-to-many | All signals are anchored to a specific organization |
| 4 | Organization | `has_pipeline` | Pipeline | One-to-many | An organization can have one or more active pipeline entries |
| 5 | Organization | `has_sequence` | Sequence | One-to-many | Multiple sequences can run against the same organization |
| 6 | Organization | `has_meeting` | Meeting | One-to-many | All meetings are anchored to an organization |
| 7 | Contact | `enrolled_in` | Sequence | Many-to-many | A contact can be enrolled in multiple sequences over time |
| 8 | Contact | `received` | Message | One-to-many | A contact receives one or more messages across sequences |
| 9 | Contact | `produced` | Engagement | One-to-many | All engagements are attributable to a contact |
| 10 | Contact | `attended` | Meeting | Many-to-many | Multiple contacts can attend the same meeting |
| 11 | Contact | `warm_path_to` | Contact | Many-to-many | Warm introduction graph edges (source can introduce target) |
| 12 | Workspace | `contains` | Intake | One-to-many | A workspace has one or more versioned intakes |
| 13 | Workspace | `has_strategy` | Strategy | One-to-many | A workspace has one or more versioned strategies |
| 14 | Workspace | `owns_sender` | SenderAccount | One-to-many | Sender accounts are scoped to a workspace |
| 15 | Intake | `seeds` | Strategy | One-to-many | A strategy is always traceable to the intake that generated it |
| 16 | Strategy | `produces` | Sequence | One-to-many | A strategy generates one or more sequences |
| 17 | Sequence | `contains` | Message | One-to-many | Messages are ordered steps within a sequence |
| 18 | Sequence | `driven_by` | Signal | Many-to-many | A sequence can be triggered by or associated with multiple signals |
| 19 | Sequence | `attributed_to` | Meeting | One-to-many | A meeting is attributed to the sequence that drove booking |
| 20 | Sequence | `sent_via` | SenderAccount | Many-to-many | A sequence uses one or more sender accounts |
| 21 | Message | `generated` | Engagement | One-to-many | An engagement (open, click, reply) is attributed to a specific message |
| 22 | Meeting | `opens` | Pipeline | One-to-one | The first meeting with a qualified account opens a pipeline entry |
| 23 | Pipeline | `attributed_to` | Thesis | Many-to-one | A closed-won pipeline entry validates one or more theses |
| 24 | Thesis | `instantiates` | Playbook | One-to-many | A validated thesis can be codified into a reusable playbook |
| 25 | Playbook | `templates` | Strategy | One-to-many | Instantiating a playbook creates a new strategy with prefilled sections |
| 26 | Signal | `triggered` | Sequence | One-to-many | A signal can be the explicit trigger for starting a sequence |
| 27 | SenderAccount | `sent` | Message | One-to-many | A sender account is the delivery identity for a specific message |
| 28 | Team | `has_member` | Contact | Many-to-many | Team membership (for internal Ridge users scoped to a workspace) |
| 29 | Integration | `syncs` | Organization | Many-to-many | An integration enriches or syncs data for specific organizations |
| 30 | AuditEvent | `records` | (any object) | Polymorphic | Every mutation to any object type has a corresponding AuditEvent |

---

## B.4 Property Type Reference

The following types are used uniformly across all object type definitions in the Ridge Ontology. All date/time storage is UTC. All monetary values are integer cents or integer USD as annotated.

| Type | Description | Constraints |
|---|---|---|
| `uuid` | 128-bit universally unique identifier | v4 for generated IDs; v7 (time-sortable) for AuditEvent |
| `string` | Variable-length Unicode text | Max 1,000 chars unless annotated otherwise |
| `text` | Long-form Unicode text | No enforced max; indexed via full-text search |
| `integer` | 64-bit signed integer | Range: −9.2 × 10¹⁸ to 9.2 × 10¹⁸ |
| `float` | 64-bit IEEE 754 double-precision | Scores in range [0.0, 1.0] unless otherwise stated |
| `boolean` | True or false | Default: false unless otherwise stated |
| `date` | Calendar date (no time component) | ISO 8601: YYYY-MM-DD |
| `ts` | Timestamp with timezone | ISO 8601 with UTC offset; stored as timestamptz in Postgres |
| `enum` | Finite set of named values | Declared in schema registry; migrations required to add values |
| `string[]` | Array of strings | Max 500 elements; each element subject to string constraints |
| `uuid[]` | Array of UUID references | Denormalized for read performance; canonical authority is link table |
| `jsonb` | Schemaless JSON binary | Used for extensibility; schemas are documented in the registry even when not enforced at DB level |

---

# SECTION C — THE RIDGE APPLICATION SUITE

> Each application is a declared consumer and producer of the Ridge Ontology. No application persists private state outside the ontology. The write-back column in each spec is the defensible artifact — it is what no competitor can replicate without Ridge's accumulated data.

---

## C.1 Strategy Engine
*Extends existing capability*

**Problem it solves:** Sales teams operate from generic messaging because constructing a researched, structured 11-section strategy for each target segment takes hours per rep and produces inconsistent output. The current Ridge implementation generates this output but treats it as a terminal artifact rather than a live, versioned, writable object.

**Input data:**
- `Intake` (all fields, current version)
- `Organization` (ICP score, thesis_fit_score, account_tier)
- `Thesis` (active theses for workspace, signal_weights, angle_preferences)
- `Playbook` (if instantiating from a template)
- `AuditEvent` (prior strategy versions for diff and regression detection)

**Processing logic:**
1. On Intake submission or update, compute a semantic diff against the previous Intake version.
2. If diff exceeds a staleness threshold (configurable per workspace), mark the current Strategy as `STALE` and trigger regeneration.
3. Pass structured Intake fields plus active Thesis parameters to the LLM orchestration layer with section-specific prompts.
4. Each of the 11 sections is generated with independent temperature and model routing (deterministic sections use lower temperature; creative sections allow higher variance).
5. Post-generation: validate section completeness, flag missing data, score internal consistency.
6. On approval, version-bump the Strategy and propagate changes to any dependent Sequences in `DRAFT` status.

**Output (write-backs to ontology):**
- New `Strategy` object (or new version of existing) with status `DRAFT`
- `AuditEvent` recording generation metadata including model version and prompt hash
- Status update on parent `Intake` to `COMPLETE`
- Optional: instantiates `Sequence` draft objects from strategy sections 7–9

**Why it's hard to copy:** The strategy quality compounds with Thesis objects — after 50+ closed-won pipeline entries, the Thesis Engine has enriched the prompt context with statistically validated angle preferences and signal weights that a cold-start competitor cannot replicate. The prompt itself is not the moat; the parameterization of the prompt by accumulated win data is.

**Dependencies:** Intake Engine (upstream data producer), Thesis Engine (angle parameterization), Playbook object type

**Build estimate:** 3 weeks, 2 engineers (1 backend, 1 AI/ML). Existing generation logic requires refactoring into versioned actions; the net-new work is the diff engine, staleness detection, and Thesis-parameterized prompt routing.

---

## C.2 Intake Engine
*Extends existing capability*

**Problem it solves:** Intake forms are universally treated as one-time setup tasks. In practice, a client's ICP shifts as they close deals, change pricing, or enter new verticals. The current Ridge intake is a static form — it does not detect when its contents are stale relative to what the client is actually winning.

**Input data:**
- User-submitted form fields (all `Intake` properties)
- `Pipeline` (closed-won records for ICP calibration feedback)
- `Thesis` (win themes to pre-populate structured ICP dimensions)
- `Playbook` (existing playbooks to detect when intake contradicts proven patterns)

**Processing logic:**
1. On form submission, parse free-text ICP description into structured `icp_structured` dimensions using a classification model (firmographic filters, technographic signals, trigger event types).
2. Cross-reference structured ICP against the workspace's closed-won Pipeline entries to surface contradictions ("your stated ICP excludes Series A companies but 40% of your wins are Series A").
3. Auto-populate `win_themes` and `objections` from Thesis objects if the workspace has prior wins.
4. Compute a completeness score; require a minimum completeness threshold before status transitions to `SUBMITTED`.
5. On intake change: trigger Strategy staleness detection and notify workspace owner if regeneration is recommended.

**Output (write-backs to ontology):**
- Structured `Intake` object with parsed `icp_structured` jsonb
- `AuditEvent` per field mutation
- Staleness flags on linked `Strategy` objects
- Completeness score stored in `Intake.settings`

**Why it's hard to copy:** The contradiction detection loop — where closed-won Pipeline data actively corrects the intake — creates a self-calibrating system. A competitor starting from a blank intake form has no calibration signal.

**Dependencies:** Strategy Engine (downstream consumer), Thesis Engine (upstream win data), Pipeline object type

**Build estimate:** 2 weeks, 2 engineers (1 backend, 1 AI/ML). Core form exists; primary work is the NLP parsing layer and contradiction detection logic.

---

## C.3 Intelligence Feed
*Extends existing capability*

**Problem it solves:** Account intelligence is currently consumed passively — reps check a feed and decide what to do with signals ad hoc. There is no mechanism to surface the right signal to the right sequence at the right time, and signals are not linked to downstream outcomes.

**Input data:**
- `Signal` (all active signals, ordered by relevance_score × urgency_score)
- `Organization` (account_tier, icp_score, thesis_fit_score)
- `Sequence` (active sequences — to suppress duplicate triggering)
- `Thesis` (signal_weights — to re-rank signals per workspace's validated preferences)

**Processing logic:**
1. Retrieve signals for workspace-scoped organization list, filtered by urgency_score > threshold and relevance_score > threshold.
2. Re-rank by `signal_relevance × thesis_signal_weight × account_tier_multiplier`.
3. Deduplicate signals from the same source for the same organization within a rolling 72-hour window.
4. Surface recommended action alongside each signal (enroll in sequence, update pipeline stage, book a meeting).
5. Record dismissals and actions as Engagement-equivalent events for Loop attribution.

**Output (write-backs to ontology):**
- `Signal.status` mutations (REVIEWED, ACTIONED, DISMISSED) on user interaction
- `Sequence` enrollment actions triggered from "Act on Signal" CTAs
- `AuditEvent` for each feed interaction (basis for Loop training data)

**Why it's hard to copy:** Signal re-ranking by workspace-specific Thesis signal weights means the feed is not a commodity news aggregator — it is calibrated to what has historically preceded wins for this specific client. Two workspaces covering the same industry see a different-ordered feed.

**Dependencies:** Signal Monitor (signal ingestion), Thesis Engine (signal_weights), Accounts app (organization tier data)

**Build estimate:** 3 weeks, 2 engineers (1 backend, 1 frontend). Existing feed requires addition of action CTA layer and thesis-weighted ranking.

---

## C.4 Accounts
*Extends into full target account workspace*

**Problem it solves:** The current Accounts view is a list. A list does not surface buying committee coverage, thesis fit, signal recency, or sequence history in a unified workspace. Account managers make decisions with incomplete context because the data exists in the ontology but is not composed into a usable interface.

**Input data:**
- `Organization` (all properties)
- `Contact` (all contacts linked to the organization)
- `Signal` (recent signals, urgency-ranked)
- `Sequence` (active and historical)
- `Meeting` (meeting history)
- `Pipeline` (current pipeline stage)
- `Thesis` (thesis_fit_score)
- Functions: `committee_coverage_score()`, `signal_recency_weighted_score()`

**Processing logic:**
1. For each organization, compute and cache a composite Account Health Score: weighted sum of thesis_fit_score, committee_coverage_score, signal_recency_weighted_score, and sequence_engagement_rate.
2. Surface tier recommendations: flag organizations where Account Health Score crosses upgrade threshold (e.g., TIER_3 → TIER_1 recommendation based on recent signals and fit).
3. Render a buying committee map (see Committee Map app) inline within the account workspace.
4. Show a chronological activity timeline: signals → sequences → engagements → meetings → pipeline movements.

**Output (write-backs to ontology):**
- `Organization.account_tier` mutations on manual or AI-recommended tier changes
- `Organization.status` transitions (e.g., PROSPECT → ACTIVE_TARGET)
- `Pipeline` stage updates initiated from the account workspace
- `AuditEvent` for all tier and status changes

**Why it's hard to copy:** The Account Health Score is a compound function of data that only exists after weeks of engagement — signal history, engagement history, committee coverage, thesis fit. A competitor can build the UI; they cannot compute the score without the underlying object graph.

**Dependencies:** Committee Map (coverage data), Signal Monitor (signal feed), Thesis Engine (fit scores), Intelligence Feed (signal display)

**Build estimate:** 4 weeks, 3 engineers (2 backend, 1 frontend). Substantial net-new frontend work; backend is primarily graph query optimization.

---

## C.5 Signal Monitor
*New*

**Problem it solves:** Signal detection in the current implementation is batch-based and undifferentiated — every signal is treated with equal priority regardless of the organization's position in the buying cycle or its thesis fit. High-urgency signals for TIER_1 accounts are buried alongside noise for unranked prospects.

**Input data:**
- External signal sources (job board APIs, news APIs, LinkedIn feed, regulatory filings, funding databases)
- `Organization` (domain list, account_tier, thesis_fit_score for scoring context)
- `Thesis` (signal_weights for type-specific relevance scoring)
- `Workspace` (atlas_eligible flag for cross-workspace signal aggregation)
- `Integration` (connection health for source APIs)

**Processing logic:**
1. Continuous polling and webhook consumption from all connected signal source integrations, normalized into a universal Signal schema.
2. For each ingested signal: (a) entity resolution — map signal to one or more Organization objects via domain, name, and alias matching; (b) relevance scoring — classify signal_type, then apply thesis signal_weights to compute relevance_score; (c) urgency scoring — time-decay function weighted by account_tier_multiplier.
3. Deduplication: semantic similarity check against signals from the same organization in the prior 72 hours; suppress near-duplicate signals.
4. Alert generation: if (relevance_score × urgency_score) > workspace-configured threshold for a TIER_1 or TIER_2 account, emit an Alert and set `triggered_alert = true`.
5. Expiration: set `expires_at` based on signal_type (funding rounds: 90 days; leadership changes: 60 days; job postings: 30 days).

**Output (write-backs to ontology):**
- New `Signal` objects with all scored properties
- `Signal.status` → NEW on creation
- Alert objects emitted to the Dynamic Layer (consumed by workspace notification delivery)
- `Organization.enrichment_last_at` updated when signals produce enrichment data
- `AuditEvent` for each signal ingestion batch

**Why it's hard to copy:** Signal scoring is parameterized by Thesis signal_weights — the same funding round signal scores differently for a workspace that has won against PE-backed companies than for one that hasn't. The monitor is not a commodity alerting tool; it is a thesis-calibrated filter. That calibration requires the Thesis Engine's accumulated win data.

**Dependencies:** Thesis Engine (signal_weights), Accounts app (account_tier), Integration objects (source connections), Intelligence Feed (downstream display)

**Build estimate:** 5 weeks, 3 engineers (2 backend/data, 1 DevOps for source integrations). Integration work dominates; signal scoring logic is straightforward once entity resolution is reliable.

---

## C.6 Committee Map
*New*

**Problem it solves:** Sales teams sell to committees, not individuals, but most sales intelligence tools model accounts as flat lists of contacts. Without a structured model of buying roles, committee coverage, and warm introduction paths, reps choose whom to contact by seniority alone — maximizing LinkedIn connection volume rather than minimizing the distance to the economic buyer.

**Input data:**
- `Organization` (target account)
- `Contact` (all contacts linked to organization)
- `Intake` (icp_structured — which seniority levels and departments constitute the target committee)
- `Engagement` (which contacts have responded — informs buying role inference)
- `SenderAccount` (connection graph from LinkedIn sender accounts)
- External: LinkedIn org chart signals, mutual connection data via HeyReach

**Processing logic:**
1. For each target organization, fetch all linked Contacts and enrich with LinkedIn org chart data to infer reporting relationships.
2. Apply a buying committee model seeded by the workspace Intake (which departments and seniority levels constitute the committee for this ICP) to assign `buying_role` and `committee_tier`.
3. Compute `warm_path_score` for each contact: traverse the SenderAccount connection graph to find shortest warm introduction path. Score is a decay function of path length and connection strength.
4. Compute `committee_coverage_score(org_id)` Function: ratio of committee_tier = PRIMARY contacts with engagement_count > 0 to total primary committee contacts.
5. Surface warm-path recommendations: "Your strongest path to the CFO is through your CEO's connection to the VP of Operations."
6. Identify committee gaps: roles present in the buying model with no linked Contact and no identified warm path.

**Output (write-backs to ontology):**
- `Contact.buying_role`, `Contact.committee_tier`, `Contact.persona_tag` mutations
- `Contact.warm_path_score` updates
- New `Contact` objects created for committee members not yet in the ontology
- `Contact → warm_path_to → Contact` link type records
- `AuditEvent` for all committee map mutations

**Why it's hard to copy:** The warm_path_score is computed from the intersection of Ridge's sender account connection graphs and the target organization's org chart. This is proprietary topology data that grows richer as the sender pool grows. A competitor starting fresh has no connection graph to traverse.

**Dependencies:** Accounts app (parent workspace), SenderAccount objects, Sender Intelligence (connection graph data), Intake Engine (committee model parameters)

**Build estimate:** 6 weeks, 3 engineers (2 backend, 1 ML for buying role inference). Graph traversal and LinkedIn data normalization are the technical risk items.

---

## C.7 Thesis Engine
*New*

**Problem it solves:** Every sales organization has an implicit theory of what makes an account winnable, but it lives in the heads of the best reps and cannot be transferred, tested, or scaled. Thesis Engine makes this tacit knowledge explicit, statistical, and actionable.

**Input data:**
- `Pipeline` (all closed-won and closed-lost records with Organization linked)
- `Organization` (firmographic, technographic, and funding properties of won and lost accounts)
- `Signal` (which signals were present in the 90 days prior to pipeline open for won accounts)
- `Sequence` (which message angles were used in won vs. lost sequences)
- `Engagement` (engagement patterns that preceded wins)
- `Intake` (current ICP parameters for comparison against empirical win patterns)

**Processing logic:**
1. For all closed-won Pipeline records: extract the Organization properties, Signal types present in the pre-pipeline window, and message angle_tags from the contributing Sequence.
2. For all closed-lost Pipeline records: extract the same features.
3. Train a lightweight logistic regression or gradient-boosted classifier on the win/loss binary outcome against these features. Compute feature importance weights.
4. Translate feature importance into: (a) `icp_filters` — the firmographic/technographic conditions most associated with wins; (b) `signal_weights` — the signal types most associated with wins in the pre-pipeline window; (c) `angle_preferences` — the message angle tags most correlated with positive engagement prior to meetings.
5. Compute `confidence_score` based on sample size and cross-validation AUC.
6. When confidence_score > workspace-configured threshold, promote Thesis to `ACTIVE` and apply weights to Signal Monitor and Strategy Engine.
7. For each target Organization, compute `thesis_fit_score` as a dot product of the organization's feature vector against the Thesis icp_filters and signal_weights.

**Output (write-backs to ontology):**
- New or updated `Thesis` objects with all computed properties
- `Organization.thesis_fit_score` updates for all workspace-scoped organizations
- `Playbook` objects auto-generated from high-confidence Theses
- `AuditEvent` for thesis generation, version, and confidence updates

**Why it's hard to copy:** The Thesis Engine requires a minimum volume of closed-won pipeline data to produce statistically valid output. A workspace with 20 wins produces a meaningfully different (and better) thesis than one with 2 wins. This is a compounding data moat — the more a workspace uses Ridge, the more defensible its Thesis becomes. No competitor can bootstrap this without the historical win data.

**Dependencies:** Pipeline object type (requires closed-won records), Loop (engagement outcome data), Signal Monitor (signal history per organization)

**Build estimate:** 6 weeks, 3 engineers (2 backend/ML, 1 data). Feature engineering from the ontology is straightforward; model training pipeline and confidence-gated promotion are the primary build items.

---

## C.8 Sender Intelligence
*New*

**Problem it solves:** LinkedIn and email deliverability are actively managed resources, not utilities. A sender with a declining health score reaches fewer decision-makers per message sent. Without health monitoring, sender pools degrade silently — teams only notice when accounts are restricted or reply rates collapse, by which point weeks of sequences have underperformed.

**Input data:**
- `SenderAccount` (all accounts for workspace)
- `Message` (volume, timing, and response data per sender)
- `Engagement` (reply rates, connection acceptance rates per sender)
- `Sequence` (active sequences drawing from each sender)
- HeyReach API: real-time account health metrics, restriction flags

**Processing logic:**
1. Scheduled daily health check per SenderAccount: pull HeyReach metrics, compute `health_score` as a weighted function of (reply_rate_7d / benchmark_reply_rate), (connection_acceptance_rate / benchmark), (daily_send_volume / daily_send_limit), and (days_since_last_restriction).
2. Warmup management: for new or recovering SenderAccounts, compute a daily_send_limit ramp schedule and enforce it by setting `daily_send_limit` per account.
3. Angle selection: for each (SenderAccount, target Organization) pair, recommend the message angle_tag most likely to perform based on historical engagement data for that sender's persona (inferred from the sender's LinkedIn profile and connection graph).
4. Pool routing: when a Sequence is activated, assign SenderAccounts from the workspace pool using a health-weighted allocation — healthy accounts get proportionally more sends. Accounts below health_score threshold are automatically paused.
5. Alert generation: health_score drop > 20% in 48 hours triggers an Alert to workspace admin.

**Output (write-backs to ontology):**
- `SenderAccount.health_score`, `daily_send_limit`, `warmup_status` updates
- `SenderAccount.status` transitions (ACTIVE → PAUSED on health drop)
- `Message.sender_account_id` assignments for queued messages
- `AuditEvent` for all sender mutations and automated routing decisions

**Why it's hard to copy:** Sender health scoring requires longitudinal engagement data per sender identity — reply rates, acceptance rates, restriction history — that accumulates over time and is proprietary to Ridge's sender pool. The angle-selection-by-sender-persona logic requires the intersection of sender identity data and historical engagement outcomes, which is unique to Ridge's data model.

**Dependencies:** HeyReach Integration, Committee Map (contact-level routing), Sequence and Message object types, Loop (engagement outcome data for angle optimization)

**Build estimate:** 5 weeks, 2 engineers (2 backend). HeyReach API integration is the critical path; health scoring and routing logic is well-defined.

---

## C.9 Account Brief
*New*

**Problem it solves:** Before any high-stakes meeting — a board introduction, a PE partner call, an executive sponsor review — a rep needs a one-page brief that synthesizes buying committee status, recent signals, thesis fit, and recommended angles. Building this manually takes 45–90 minutes and produces inconsistent output. The brief is typically out of date by meeting time.

**Input data:**
- `Organization` (all properties, thesis_fit_score, account_tier)
- `Contact` (committee map: buying roles, seniority, engagement history)
- `Signal` (recent signals, urgency-ranked, last 90 days)
- `Sequence` (active and historical, reply and meeting rates)
- `Meeting` (meeting history, outcomes)
- `Pipeline` (current stage, value, close date)
- `Thesis` (active thesis hypothesis text, confidence_score)
- Functions: `committee_coverage_score()`, `signal_recency_weighted_score()`

**Processing logic:**
1. On demand (or on schedule before a linked Meeting), pull the full object graph for the target Organization.
2. Synthesize into a structured brief with fixed sections: Executive Summary, Thesis Fit Rationale, Buying Committee Status (table), Recent Signal Summary (top 3 signals with dates), Sequence History and Engagement Summary, Recommended Next Action.
3. Formatting: brief must fit one printed page (A4) or render as a clean PDF/HTML single page. No marketing language. Declarative sentences only. Numbers where possible ("4 of 7 committee members identified; 2 engaged").
4. Brief is versioned and timestamped. Re-generation is triggered on significant object changes (new signal, committee change, meeting booked).
5. Brief can be exported as PDF or shared via a read-only URL with a configurable expiry.

**Output (write-backs to ontology):**
- Brief artifact stored as a versioned document linked to the Organization object (stored in `Organization.settings` or as a distinct BriefDocument object if volume warrants)
- `AuditEvent` recording generation, access, and export events
- `Signal.status` → REVIEWED for signals surfaced in the brief

**Why it's hard to copy:** The brief is only as good as the underlying ontology — a competitor building a brief generator without accumulated signal history, committee mapping, and thesis fit data produces a generic company summary, not a sales-ready intelligence document. The density of actionable information in a Ridge Account Brief is a direct function of how much write-back data the platform has accumulated for that account.

**Dependencies:** Committee Map (buying committee data), Thesis Engine (fit score and hypothesis text), Signal Monitor (signal data), Accounts app (organization data)

**Build estimate:** 3 weeks, 2 engineers (1 backend, 1 frontend). Structurally similar to the existing Strategy Engine generation pattern; primary work is the brief template, PDF export, and shareable URL generation.

---

## C.10 Loop
*New*

**Problem it solves:** The question every sales intelligence platform fails to answer: which signals, which angles, and which sequences actually produced the meetings and the pipeline? Without a structured attribution model, teams optimize for activity (sends, connections) rather than outcomes (meetings, closed revenue). Loop closes the attribution loop from Signal to Meeting to Pipeline.

**Input data:**
- `Signal` (all signals present for an organization in the 90 days preceding sequence launch)
- `Message` (angle_tags used in sequences that preceded meetings)
- `Engagement` (open, click, reply events with sentiment)
- `Meeting` (meeting outcomes)
- `Pipeline` (closed-won and closed-lost outcomes)
- `Sequence` (which sequence types and templates preceded which outcomes)
- `Thesis` (current theses to validate or invalidate)

**Processing logic:**
1. Attribution model: for each Meeting, identify the contributing Sequence, the Messages within it, their angle_tags, and the Signals that were present for the Organization in the pre-sequence window. Store this attribution chain.
2. For each closed-won Pipeline entry: traverse back to the originating Sequence and its driving Signal(s). Increment win attribution counts on those Signal types and angle_tags.
3. For each closed-lost Pipeline entry: same traversal; increment loss attribution.
4. Aggregate win/loss attribution data and feed into Thesis Engine as the `evidence_pipeline_ids` and feature weights.
5. Surface Loop Insights: "Sequences launched within 14 days of a LEADERSHIP_CHANGE signal have a 3.2× higher meeting rate than baseline for TIER_1 accounts in your ICP." These are Function outputs, not persisted objects — they recompute on fresh data.
6. Highlight angle degradation: angle_tags whose reply_rate has declined > 30% over the trailing 60 days versus the prior 60 days.

**Output (write-backs to ontology):**
- `Engagement.sentiment` and `Engagement.sentiment_confidence` backfill via NLP classification
- `Thesis.evidence_pipeline_ids` and `Thesis.evidence_win_count` updates
- `Playbook.win_count` increments for playbooks attributed to wins
- `Signal.status` → ACTIONED for signals attributed to meeting or pipeline outcomes
- `AuditEvent` for all attribution writes

**Why it's hard to copy:** Loop's output quality is a direct function of the number of complete attribution chains in the ontology — signal → sequence → engagement → meeting → pipeline. A fresh competitor install has zero chains. A Ridge workspace with 18 months of operation has hundreds. The insights become more statistically reliable and more differentiated with each additional win or loss recorded. This is the core compounding moat of the entire platform.

**Dependencies:** Signal Monitor (signal history), Sender Intelligence (sender-level performance data), Thesis Engine (upstream consumer of Loop output), Pipeline and Meeting object types (terminal outcome anchors)

**Build estimate:** 7 weeks, 3 engineers (2 backend/data, 1 ML). The attribution model architecture and data pipeline are the critical path items; the insight surface layer is relatively lightweight.

---

## C.11 Atlas
*New — gated by workspace tier*

**Problem it solves:** Each workspace in Ridge operates in isolation, accumulating signal and win data that is relevant only to that client. But Ridge as a platform observes patterns across dozens or hundreds of workspaces targeting the same verticals. Without an aggregation layer, this cross-workspace intelligence is invisible — Ridge cannot answer "which signals most reliably precede pipeline opens in the SaaS-to-enterprise vertical across all workspaces."

**Input data:**
- All `Signal` objects where `Organization.atlas_eligible = true` (workspace opt-in required)
- All `Thesis` objects from `atlas_eligible` workspaces (anonymized)
- `Playbook` objects marked `is_platform_default = false` but eligible for promotion
- `Organization` firmographic and vertical tags (anonymized — no client-identifying context exposed)
- `Pipeline` outcome data from atlas-eligible workspaces (anonymized)

**Processing logic:**
1. Cross-workspace signal correlation: for each signal_type × vertical combination, compute the aggregate meeting_rate and pipeline_open_rate across all atlas-eligible workspaces. Update a rolling Atlas Signal Index.
2. Cross-workspace thesis consensus: identify Thesis patterns (icp_filters + signal_weights combinations) that appear in multiple workspaces with high confidence_score. Promote these to platform-level Playbooks available to all workspaces at the qualifying tier.
3. Vertical benchmarks: compute vertical-level benchmarks for reply_rate, meeting_rate, committee_coverage_score, and average days-to-meeting. Surface benchmarks within each workspace's Accounts app as a comparison layer.
4. Atlas is read-only at the workspace level. Workspaces consume Atlas outputs (benchmarks, promoted Playbooks) but cannot write to the Atlas layer directly. The Atlas layer writes back to the platform Playbook library.
5. Strict privacy model: no individual contact data, no company names, no workspace identifiers are exposed cross-workspace. All Atlas queries operate on anonymized aggregate cohorts. Workspace atlas_eligible opt-in is explicit and revocable.

**Output (write-backs to ontology):**
- Platform-level `Playbook` objects promoted from atlas-consensus Theses (`is_platform_default = true`)
- Atlas Signal Index stored as a platform-level reference object (not workspace-scoped)
- Vertical benchmark Functions updated on weekly schedule
- `AuditEvent` for all Atlas promotion and aggregation events (at platform level, not workspace level)

**Why it's hard to copy:** Atlas requires a critical mass of workspaces — likely 20+ active workspaces in a given vertical — before its outputs are statistically meaningful. This is a network effect with a delayed payoff: the platform must reach scale before Atlas produces signal, but once it does, the Atlas layer provides a competitive intelligence advantage that no single-workspace tool can match. The combination of Atlas-backed Playbooks and workspace-specific Theses creates a two-tier intelligence stack that individual point solutions cannot replicate.

**Dependencies:** All workspace-level applications (upstream data producers), Thesis Engine (thesis data), Signal Monitor (signal data), requires explicit platform-level infrastructure separate from workspace-scoped Postgres schemas

**Build estimate:** 8 weeks, 4 engineers (2 backend/data, 1 ML, 1 security/privacy). Data anonymization, privacy model, and aggregate query infrastructure are the primary build items. Atlas should not be started until the workspace-level application suite is stable and producing data.

---

## C.12 Command Center
*New*

**Problem it solves:** Operations leads and revenue managers need a real-time view of the health of the entire sales intelligence operation: sender health across the pool, sequences in flight, pipeline movement, signal alert backlog, and team activity. Currently this view does not exist — health monitoring is ad hoc and reactive.

**Input data:**
- All active `Sequence` objects and their engagement metrics
- `SenderAccount` (health_score across pool)
- `Signal` (alert backlog: signals with status = NEW and urgency_score > threshold)
- `Pipeline` (stage distribution, recent movements)
- `Meeting` (scheduled and recently completed)
- `Integration` (connection health across all integrations)
- `AuditEvent` (recent activity log for team visibility)
- Functions: all computed health and coverage functions across the workspace

**Processing logic:**
1. Aggregate sender pool health: median, p10, and p90 of health_score across active SenderAccounts. Flag accounts below threshold. Display warmup queue.
2. Sequence operations view: active sequences by status (ACTIVE, PAUSED, DRAFT), daily send velocity vs. limit, reply rate by sequence.
3. Signal alert triage: list of unactioned Signals with urgency_score above threshold, sorted by priority, with one-click actions (Enroll in Sequence, Dismiss, Route to Account).
4. Pipeline health: stage distribution chart, recent stage movements, deals overdue for stage advancement.
5. Integration status: real-time connection status for all Integration objects; visual alert on DEGRADED or DISCONNECTED integrations.
6. Activity log: recent AuditEvents across the workspace, filterable by actor_type (USER vs. AI_ACTION vs. SYSTEM).
7. Command Center does not generate AI output — it is the operational control surface. Write-backs are confined to triage actions and integration reconnects.

**Output (write-backs to ontology):**
- `Signal.status` mutations from triage actions (REVIEWED, ACTIONED, DISMISSED)
- `Sequence.status` mutations (PAUSED, RESUMED) from operator intervention
- `Pipeline.stage` transitions initiated from Command Center
- `Integration` reconnect actions (triggers credential refresh workflow)
- `AuditEvent` for all Command Center write-backs

**Why it's hard to copy:** Command Center's value is entirely dependent on the breadth and quality of the underlying ontology. A dashboard over a shallow data model displays metrics. A dashboard over the Ridge Ontology displays the operational health of an AI-driven intelligence system with write-back controls. The interface is not the moat; the ontology is.

**Dependencies:** All other applications (Command Center is a consumer-only aggregation layer), Integration objects (health monitoring), Sender Intelligence (sender pool health data), Signal Monitor (alert backlog)

**Build estimate:** 4 weeks, 2 engineers (1 backend, 1 frontend). Primarily a read-optimized query and display problem; write-back actions are thin wrappers on existing Kinetic Layer actions.

---

## Application Suite Summary

| # | Application | Type | Status | Build (weeks) | Team |
|---|---|---|---|---|---|
| 1 | Strategy Engine | AI generation | Extends existing | 3 | 2 eng |
| 2 | Intake Engine | Data ingestion + parsing | Extends existing | 2 | 2 eng |
| 3 | Intelligence Feed | Signal display + action | Extends existing | 3 | 2 eng |
| 4 | Accounts | Account workspace | Extends existing | 4 | 3 eng |
| 5 | Signal Monitor | Trigger event monitoring | New | 5 | 3 eng |
| 6 | Committee Map | Buying committee graph | New | 6 | 3 eng |
| 7 | Thesis Engine | Win pattern ML | New | 6 | 3 eng |
| 8 | Sender Intelligence | Sender health + routing | New | 5 | 2 eng |
| 9 | Account Brief | Synthesized account doc | New | 3 | 2 eng |
| 10 | Loop | Attribution + learning | New | 7 | 3 eng |
| 11 | Atlas | Cross-workspace intelligence | New (gated) | 8 | 4 eng |
| 12 | Command Center | Operational dashboard | New | 4 | 2 eng |
| | **Total (sequential)** | | | **56 weeks** | |
| | **Estimated (parallel, 2 tracks)** | | | **~28 weeks** | **~6 eng** |

> **Build sequencing note:** The dependency graph mandates the following ordering. Track 1 (intelligence data layer): Signal Monitor → Intelligence Feed → Loop → Atlas. Track 2 (account intelligence): Intake Engine → Accounts → Committee Map → Thesis Engine → Account Brief → Sender Intelligence. Strategy Engine and Command Center can proceed in parallel with both tracks. Atlas should not begin until Track 1 is producing live data.


---

# Ridge Platform Expansion Brief — Sections D & E

---

## SECTION D — ACTIONS AND FUNCTIONS (THE KINETIC LAYER)

> **Ontology Conventions**
> - Actions **write** to the ontology (create, update, or delete objects and properties).
> - Functions **compute** derived values from existing objects and return results without persisting them unless explicitly cached.
> - Object names are `PascalCase`. Properties are `snake_case`. API routes follow REST conventions.

---

### D.1 Actions

---

#### Action 1: `run_strategy`

| Field | Detail |
|---|---|
| **Trigger** | Manual (user clicks "Generate Strategy" in Workspace view) |
| **Complexity** | L |

**Input Parameters**

```
workspace_id: UUID
intake_snapshot_id: UUID
force_refresh: boolean (default: false)
```

**Processing Logic**

Part 1 — Thesis Generation: The function retrieves the `Workspace`, its linked `Intake`, and all `Organization` objects in the workspace. It passes the intake segment definition, ICP criteria, and a curated list of 5–8 company profiles to Claude Sonnet with a structured prompt requesting 3–5 differentiated thesis statements, each with a named angle, a claim about the buyer's current situation, and a hypothesis about why they would change now.

Part 2 — Strategy Assembly: For each thesis, the function calls `thesis_fit_score()` against the top 20 accounts in the workspace to rank thesis applicability. It then assembles a `Strategy` object containing ranked theses, recommended sequencing cadence (based on segment average sales cycle from `win_rate_by_segment()`), and a set of initial message angle suggestions derived from `angle_effectiveness()` for the matching vertical.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Strategy` | `theses[]`, `ranked_theses[]`, `cadence_recommendation`, `angle_suggestions[]`, `generated_at`, `model_version`, `status = "active"` |
| `Workspace` | `strategy_id`, `strategy_generated_at` |
| `Thesis` (per thesis) | `statement`, `angle_type`, `situation_claim`, `change_hypothesis`, `fit_scores{}` |

**Error Handling**
- If Claude returns malformed JSON, retry once with explicit JSON schema in prompt; on second failure, set `Strategy.status = "failed"`, log error, surface toast notification.
- If `intake_snapshot_id` is missing or stale (>90 days), block execution and return `INTAKE_REQUIRED` error code.
- Rate limit: one strategy generation per workspace per 24 hours unless `force_refresh = true` (requires admin role).

---

#### Action 2: `score_readiness`

| Field | Detail |
|---|---|
| **Trigger** | Scheduled (nightly, 02:00 UTC) or manual |
| **Complexity** | M |

**Input Parameters**

```
organization_id: UUID
segment_id: UUID
recalculate_signals: boolean (default: false)
```

**Processing Logic**

Pulls all `Signal` objects linked to the organization created within the past 60 days, weights them by `signal_relevance()` score, and combines with static ICP fit (`icp_fit_score()`). Applies a time-decay function where signals older than 30 days contribute at 50% weight and signals older than 45 days at 20%. Computes a composite 0–100 integer score and classifies it into tiers: Cold (0–39), Warming (40–59), Ready (60–79), Hot (80–100).

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Organization` | `readiness_score`, `readiness_tier`, `readiness_scored_at`, `readiness_signal_ids[]` |
| `Workspace` | `last_scored_at` (aggregate) |

**Error Handling**
- If fewer than 2 signals exist for the organization, compute score from ICP fit alone and set `readiness_tier = "insufficient_data"`.
- Log all score changes >20 points to `AuditLog` for review.

---

#### Action 3: `enrich_account`

| Field | Detail |
|---|---|
| **Trigger** | Event-driven (on `Organization` creation or manual refresh) |
| **Complexity** | M |

**Input Parameters**

```
organization_id: UUID
enrichment_sources: string[] (e.g., ["clearbit", "builtwith", "linkedin"])
overwrite_existing: boolean (default: false)
```

**Processing Logic**

Queries configured enrichment APIs sequentially (Clearbit for firmographics, BuiltWith for technographics, LinkedIn for headcount signals) using the organization's domain as the primary lookup key. Merges responses into a normalized `EnrichmentPayload`, with source provenance tracked per field. Only overwrites existing values when `overwrite_existing = true` or when the existing field is null.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Organization` | `employee_count`, `revenue_range`, `industry`, `tech_stack[]`, `headquarters`, `enriched_at`, `enrichment_sources[]` |
| `EnrichmentLog` | `source`, `fields_updated[]`, `raw_response` (JSON blob), `enriched_at` |

**Error Handling**
- If an enrichment source returns a 429 or 5xx, skip that source, mark it as `failed` in `EnrichmentLog`, and continue with remaining sources.
- If domain is unresolvable, set `Organization.enrichment_status = "domain_error"` and notify workspace owner.

---

#### Action 4: `fire_signal`

| Field | Detail |
|---|---|
| **Trigger** | Event-driven (from `scan_intelligence` output) or manual |
| **Complexity** | S |

**Input Parameters**

```
organization_id: UUID
signal_type: enum (funding, hiring, leadership_change, product_launch, partnership, tech_adoption, intent_spike)
source_url: string
raw_content: string
detected_at: timestamp
confidence: float (0.0–1.0)
```

**Processing Logic**

Creates a `Signal` object, then calls Claude Haiku to extract a structured signal summary (≤3 sentences, entity name, signal implication for the workspace's thesis) from `raw_content`. Sets `signal.relevance_score` using `signal_relevance()` at creation time. Emits an internal event `signal.fired` that triggers `score_readiness` recalculation for the linked organization.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Signal` | `organization_id`, `signal_type`, `summary`, `source_url`, `raw_content`, `detected_at`, `confidence`, `relevance_score`, `status = "active"` |
| `Organization` | `signal_ids[]` (append), `last_signal_at` |

**Error Handling**
- Duplicate detection: if a signal with the same `source_url` already exists, skip creation and return `DUPLICATE_SIGNAL`.
- If Haiku summarization fails, store raw content and set `Signal.summary_status = "pending_review"`.

---

#### Action 5: `draft_message`

| Field | Detail |
|---|---|
| **Trigger** | Manual (user selects account + signal + angle in Composer) |
| **Complexity** | M |

**Input Parameters**

```
organization_id: UUID
contact_id: UUID
signal_id: UUID (optional)
thesis_id: UUID
angle_type: string
sender_id: UUID
tone: enum (direct, consultative, provocative)
word_limit: integer (default: 75)
```

**Processing Logic**

Assembles a prompt context package: the contact's role and seniority from `Person`, the organization's `readiness_tier` and `tech_stack`, the selected `Thesis` statement and angle, and the `Signal` summary if provided. Passes to Claude Sonnet requesting a message under `word_limit` words that opens with the signal (if present), references one specific implication of the thesis for the contact's role, and closes with a low-friction call to action (no demo asks for Cold/Warming accounts). Evaluates output with `message_quality_score()` and regenerates once if score < 60.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Message` | `contact_id`, `organization_id`, `thesis_id`, `signal_id`, `angle_type`, `body`, `word_count`, `quality_score`, `sender_id`, `status = "draft"`, `created_at` |
| `Contact` | `last_message_drafted_at` |

**Error Handling**
- If `word_count` exceeds `word_limit + 10` after two attempts, return the best attempt with a `WORD_LIMIT_EXCEEDED` warning flag.
- Block drafting for contacts with `status = "opted_out"` and return `CONTACT_OPTED_OUT` error.

---

#### Action 6: `send_via_heyreach`

| Field | Detail |
|---|---|
| **Trigger** | Manual (user approves draft) or Sequence schedule |
| **Complexity** | M |

**Input Parameters**

```
message_id: UUID
sender_id: UUID
scheduled_at: timestamp (optional; null = immediate)
sequence_id: UUID (optional)
```

**Processing Logic**

Validates `sender_id` health via `deliverability_health()` — aborts if sender's daily send count has reached the configured daily limit or if health score < 40. Calls the HeyReach MCP integration to push the message body, recipient LinkedIn URL, and sender credentials. On success, HeyReach returns a `campaign_message_id` which is stored on the `Message` object. If `sequence_id` is provided, updates the `SequenceStep` status to `sent`.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Message` | `status = "sent"`, `sent_at`, `heyreach_message_id`, `sender_id` |
| `SenderAccount` | `daily_send_count` (increment), `last_sent_at` |
| `SequenceStep` | `status = "sent"`, `sent_at` (if sequence context) |

**Error Handling**
- If HeyReach API returns a non-200, set `Message.status = "send_failed"`, log the error payload, and surface a retry option.
- If sender health check fails, surface `SENDER_UNHEALTHY` with the specific metric that failed (daily limit, score, or flagged status).

---

#### Action 7: `log_outcome`

| Field | Detail |
|---|---|
| **Trigger** | Event-driven (HeyReach webhook) or manual |
| **Complexity** | S |

**Input Parameters**

```
message_id: UUID
outcome_type: enum (replied, meeting_booked, connection_accepted, no_response, bounced, opted_out)
occurred_at: timestamp
raw_payload: JSON (webhook data)
meeting_id: UUID (optional, for meeting_booked)
```

**Processing Logic**

Looks up the `Message` to retrieve `organization_id`, `contact_id`, `thesis_id`, and `angle_type`. Creates an `Outcome` object and updates the parent `Message` status. Propagates the outcome to aggregate metrics: increments the relevant counter on `Thesis.outcome_counts{}` and on `SenderAccount.outcome_counts{}`. If `outcome_type = "opted_out"`, updates `Contact.status = "opted_out"`.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Outcome` | `message_id`, `outcome_type`, `occurred_at`, `raw_payload` |
| `Message` | `status`, `outcome_type`, `outcome_at` |
| `Thesis` | `outcome_counts{}` (increment matching key) |
| `SenderAccount` | `outcome_counts{}` (increment) |
| `Contact` | `status = "opted_out"` (conditional) |

**Error Handling**
- Idempotency: if an `Outcome` with the same `message_id` and `outcome_type` already exists, skip creation and return `OUTCOME_EXISTS`.

---

#### Action 8: `ratify_thesis`

| Field | Detail |
|---|---|
| **Trigger** | Manual (user action) or automatic (when reply + meeting threshold met) |
| **Complexity** | S |

**Input Parameters**

```
thesis_id: UUID
ratification_type: enum (manual, auto_threshold)
supporting_outcome_ids: UUID[]
notes: string (optional)
```

**Processing Logic**

Validates that the provided `outcome_ids` are linked to messages with the `thesis_id`. Computes the reply rate and meeting conversion rate for the thesis from `Thesis.outcome_counts`. If `ratification_type = "auto_threshold"`, requires reply_rate ≥ 15% and at least 3 meeting outcomes across a minimum of 20 sends. Sets `Thesis.status = "ratified"` and records the validation evidence.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Thesis` | `status = "ratified"`, `ratified_at`, `ratification_type`, `supporting_outcome_ids[]`, `reply_rate_at_ratification`, `notes` |
| `Strategy` | `ratified_thesis_count` (increment) |

**Error Handling**
- If auto-threshold criteria are not met, return `THRESHOLD_NOT_MET` with current stats (e.g., `{reply_rate: 0.09, meetings: 1, sends: 22}`).

---

#### Action 9: `promote_to_canonical`

| Field | Detail |
|---|---|
| **Trigger** | Manual (admin or workspace owner) |
| **Complexity** | S |

**Input Parameters**

```
message_id: UUID (or angle_id: UUID)
promotion_target: enum (playbook_message, canonical_angle)
vertical: string
segment_id: UUID (optional)
promoted_by: UUID (user_id)
```

**Processing Logic**

Copies the `Message` body (or `Angle` definition) into a new `PlaybookEntry` object tagged with `vertical`, `segment_id`, and `angle_type`. Links the source message/angle for lineage tracking. Sets a `promoted_by` and `promoted_at` timestamp. The entry becomes available in the Composer's "Proven Templates" panel for all workspaces matching the same vertical and segment.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `PlaybookEntry` | `body`, `angle_type`, `vertical`, `segment_id`, `source_message_id`, `promoted_by`, `promoted_at`, `status = "active"` |
| `Message` / `Angle` | `canonical_status = "promoted"`, `playbook_entry_id` |

**Error Handling**
- Requires `promoted_by` user to have `admin` or `owner` role; return `PERMISSION_DENIED` otherwise.

---

#### Action 10: `scan_intelligence`

| Field | Detail |
|---|---|
| **Trigger** | Scheduled (daily, per active workspace) or manual |
| **Complexity** | L |

**Input Parameters**

```
workspace_id: UUID
organization_ids: UUID[] (subset, or all if empty)
signal_types: string[] (default: all types)
lookback_hours: integer (default: 48)
```

**Processing Logic**

For each organization in scope, constructs 3–5 search queries using the organization name, domain, key executives, and relevant industry keywords. Executes queries via a web search API (Brave Search or Serper) and passes results through Claude Haiku with a classification prompt that identifies signal type, confidence, and relevance to the workspace's active theses. Any result above confidence threshold (0.65) triggers `fire_signal`. Stores a `ScanRun` record with counts of results processed, signals fired, and tokens consumed.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `ScanRun` | `workspace_id`, `organizations_scanned`, `results_processed`, `signals_fired`, `tokens_consumed`, `started_at`, `completed_at` |
| `Signal` | (via `fire_signal` — see Action 4) |

**Error Handling**
- If search API quota is exhausted, pause scan, log remaining organization IDs to `ScanRun.pending_ids`, and reschedule continuation in 1 hour.
- Cap total signals fired per workspace per scan run at 50 to prevent noise flooding.

---

#### Action 11: `map_committee`

| Field | Detail |
|---|---|
| **Trigger** | Manual or event-driven (when `Organization.employee_count` first populated) |
| **Complexity** | M |

**Input Parameters**

```
organization_id: UUID
deal_type: enum (new_logo, expansion, renewal)
infer_from_similar: boolean (default: true)
```

**Processing Logic**

Retrieves known `Person` objects linked to the organization. Passes organization profile (industry, size, tech stack) and known contacts to Claude Sonnet with a prompt requesting inference of the typical buying committee structure for the deal type in that company profile — identifying roles (Economic Buyer, Champion, Technical Evaluator, Legal/Procurement, End User), their likely titles at that company size, and estimated influence weight. If `infer_from_similar = true`, supplements with committee patterns from similar organizations in the same segment that have closed deals (queried from `Outcome` data).

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `BuyingCommittee` | `organization_id`, `roles[]` (each with `role_type`, `inferred_title`, `influence_weight`, `known_contact_id` or null), `deal_type`, `inferred_at`, `confidence` |
| `Organization` | `buying_committee_id`, `committee_mapped_at` |

**Error Handling**
- If no `Person` objects exist for the organization, create committee with all roles as `inferred` (no `known_contact_id`) and flag `BuyingCommittee.has_known_contacts = false`.

---

#### Action 12: `score_sender_health`

| Field | Detail |
|---|---|
| **Trigger** | Scheduled (every 6 hours) or manual |
| **Complexity** | M |

**Input Parameters**

```
sender_account_ids: UUID[] (or all active senders if empty)
include_heyreach_metrics: boolean (default: true)
```

**Processing Logic**

For each sender, retrieves `SenderAccount` metrics: 7-day send volume, acceptance rate, reply rate, and connection request acceptance rate. If `include_heyreach_metrics = true`, pulls real-time deliverability flags from the HeyReach API (account warm status, restriction flags). Computes a 0–100 health score weighting: reply rate (40%), acceptance rate (30%), restriction flags (−30 each), daily send consistency (10%), and age of account (20%). Classifies senders as Healthy (70–100), Caution (40–69), or Resting (0–39).

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `SenderAccount` | `health_score`, `health_tier`, `health_scored_at`, `heyreach_flags[]` |
| `SenderPoolHealth` | `scored_at`, `healthy_count`, `caution_count`, `resting_count`, `avg_health_score` |

**Error Handling**
- If HeyReach API is unreachable, compute score from local metrics only and set `SenderAccount.heyreach_sync_status = "unavailable"`.
- Alert workspace owner if healthy sender count drops below 5.

---

#### Action 13: `generate_brief`

| Field | Detail |
|---|---|
| **Trigger** | Manual (user requests account brief) or pre-meeting (Circleback event) |
| **Complexity** | M |

**Input Parameters**

```
organization_id: UUID
workspace_id: UUID
include_sections: string[] (default: all)
format: enum (markdown, pdf)
```

**Processing Logic**

Assembles structured data from the ontology: organization firmographics, `readiness_score` and tier, top 3 active signals (sorted by `relevance_score`), `BuyingCommittee` roles with known contacts, active `Thesis` with fit score, message history summary (sent count, reply count), and Circleback meeting notes if linked. Passes this structured context to Claude Sonnet requesting a formatted one-page brief. For `format = "pdf"`, renders the markdown output through a PDF generation step (using `@react-pdf/renderer` or equivalent).

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `AccountBrief` | `organization_id`, `workspace_id`, `content_markdown`, `content_pdf_url` (if PDF), `generated_at`, `sections_included[]` |

**Error Handling**
- If PDF rendering fails, return markdown version with `PDF_RENDER_FAILED` warning.
- Cache brief for 24 hours; return cached version with `from_cache: true` flag if called again within that window.

---

#### Action 14: `sync_crm`

| Field | Detail |
|---|---|
| **Trigger** | Scheduled (every 4 hours) or event-driven (on `Outcome` creation) |
| **Complexity** | L |

**Input Parameters**

```
workspace_id: UUID
crm_type: enum (salesforce, hubspot)
direction: enum (push, pull, bidirectional)
object_types: string[] (default: ["contacts", "companies", "activities"])
```

**Processing Logic**

**Push:** Maps `Organization` → CRM Company, `Person` → CRM Contact, and `Outcome` → CRM Activity using field-mapping config stored per workspace. Uses CRM upsert endpoints keyed on `crm_external_id` (stored on each object) to prevent duplicates. Writes Ridge-specific fields (readiness score, thesis, angle) to custom CRM fields.

**Pull:** Retrieves CRM stage and owner updates for linked companies and contacts; updates `Organization.crm_stage` and `Person.crm_owner` accordingly. Flags any CRM-closed opportunities to update workspace pipeline status.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Organization` | `crm_external_id`, `crm_stage`, `crm_last_synced_at` |
| `Person` | `crm_external_id`, `crm_owner`, `crm_last_synced_at` |
| `SyncLog` | `workspace_id`, `crm_type`, `direction`, `records_pushed`, `records_pulled`, `errors[]`, `synced_at` |

**Error Handling**
- OAuth token refresh on 401. If refresh fails, set `workspace.crm_sync_status = "auth_error"` and notify owner.
- Partial failures: log failed records to `SyncLog.errors[]`, continue with remaining records, and surface a summary.

---

#### Action 15: `archive_workspace`

| Field | Detail |
|---|---|
| **Trigger** | Manual (admin only) |
| **Complexity** | S |

**Input Parameters**

```
workspace_id: UUID
reason: string
initiated_by: UUID (user_id)
grace_period_days: integer (default: 30)
```

**Processing Logic**

Soft-deletes the workspace by setting `Workspace.status = "archived"` and `archived_at` timestamp. Does not delete associated `Organization`, `Signal`, `Message`, or `Outcome` objects — these are retained for analytics and potential restoration. Cancels any scheduled `ScanRun` or `SyncLog` jobs for the workspace. After `grace_period_days`, a scheduled cleanup job sets all child objects to `status = "archived"` and removes them from active query scopes.

**Ontology Writes**

| Object | Properties Written |
|---|---|
| `Workspace` | `status = "archived"`, `archived_at`, `archive_reason`, `archived_by`, `purge_after` |
| `ScheduledJob` | `status = "cancelled"` (all jobs for workspace) |

**Error Handling**
- Requires `initiated_by` user to have `admin` role.
- Block if workspace has active CRM sync with pending writes; surface `SYNC_IN_PROGRESS` error.

---

### D.2 Functions

---

#### Function 1: `thesis_fit_score(account, thesis)`

**Input Objects:** `Organization`, `Thesis`

**Computation Logic**

Extracts from `Organization`: `industry`, `employee_count`, `revenue_range`, `tech_stack[]`, `readiness_tier`. Extracts from `Thesis`: `angle_type`, `situation_claim` (which encodes the assumed current state of the buyer). Computes a weighted match score across 5 dimensions: (1) industry alignment with thesis vertical (0–25 pts), (2) company size alignment with thesis ICP size band (0–20 pts), (3) tech stack overlap with implied stack in thesis situation claim (0–25 pts, cosine similarity on tech embeddings if available, else keyword match), (4) readiness tier bonus (Hot = 20, Ready = 10, Warming = 5, Cold = 0), (5) existing signal count above confidence 0.7 (5 pts per signal, max 10). Returns integer 0–100.

**Output:** `number` (0–100 integer). Higher = stronger fit. Scores above 70 indicate thesis is appropriate to lead with; below 40 indicates misalignment.

**Caching:** Cached per `(organization_id, thesis_id)` pair for 12 hours or invalidated on `Organization` property update or new Signal above 0.7 confidence.

**Used by:** `run_strategy`, `score_readiness`, `generate_brief`

---

#### Function 2: `readiness_score(account, segment)`

**Input Objects:** `Organization`, `Segment`

**Computation Logic**

Retrieves all `Signal` objects linked to `organization_id` within the past 60 days. Applies time-decay weights: days 0–14 = 1.0×, days 15–30 = 0.7×, days 31–45 = 0.4×, days 46–60 = 0.2×. Sums weighted `Signal.relevance_score` values, normalizes to 0–50 (signal component). Adds `icp_fit_score()` output normalized to 0–40 (ICP component). Adds 10-point bonus if any signal type is `funding` or `leadership_change` in the past 14 days (recency spike). Returns integer 0–100.

**Output:** `{ score: number, tier: string, signal_count: number, dominant_signal_type: string }`. Tier thresholds: Hot ≥ 80, Ready ≥ 60, Warming ≥ 40, Cold < 40.

**Caching:** 6-hour TTL, invalidated on new Signal creation for the organization.

**Used by:** `score_readiness`, `generate_brief`, Workspace Intelligence dashboard

---

#### Function 3: `buying_committee_inference(account)`

**Input Objects:** `Organization`, `Person[]` (linked to organization), `Outcome[]` (from similar organizations)

**Computation Logic**

If `BuyingCommittee` exists and was created within 30 days, returns the cached committee. Otherwise, groups known `Person` objects by seniority and function (parsed from title using a role-classification map). Identifies gaps — committee roles with no known contact. Queries historical `Outcome` objects from organizations in the same `industry` + `employee_count` band with positive outcomes (meeting_booked or ratified thesis) to extract the set of titles that appeared in those deals. Returns a ranked list of gap roles by deal impact frequency. Calls `map_committee` if no `BuyingCommittee` object exists.

**Output:** `{ committee: BuyingCommittee, gaps: Role[], coverage_pct: number }`. `coverage_pct` = known contacts / total inferred roles.

**Caching:** 30-day TTL on existing `BuyingCommittee` object, recomputed on new `Person` addition.

**Used by:** `map_committee`, `generate_brief`, Committee view in Account detail

---

#### Function 4: `deliverability_health(sender_pool)`

**Input Objects:** `SenderAccount[]`

**Computation Logic**

Aggregates health scores computed by `score_sender_health` across all senders in the pool. Computes: `healthy_ratio` (healthy senders / total), `avg_daily_capacity` (sum of `max_daily_sends` for healthy senders), `caution_ratio`, `resting_ratio`. Applies a pool-level risk flag if `healthy_ratio < 0.5` or any single sender has been restricted in the past 7 days. Returns a composite pool score and breakdown.

**Output:** `{ pool_score: number, healthy_count: number, avg_daily_capacity: number, risk_flag: boolean, risk_reasons: string[] }`

**Caching:** 6-hour TTL, aligned with `score_sender_health` schedule.

**Used by:** `send_via_heyreach` (pre-flight check), Sender Health dashboard

---

#### Function 5: `pipeline_velocity(workspace)`

**Input Objects:** `Workspace`, `Outcome[]`, `Organization[]`

**Computation Logic**

Filters `Outcome` objects to `outcome_type IN (meeting_booked, replied)` within the past 90 days for the workspace. Groups by `organization_id` and computes time-to-first-response (days from first send to first reply). Computes median and 75th percentile time-to-reply and time-to-meeting. Compares to 30-day rolling average to compute velocity trend (accelerating / stable / decelerating). Returns structured velocity metrics.

**Output:** `{ median_days_to_reply: number, median_days_to_meeting: number, velocity_trend: string, deals_in_progress: number, meetings_last_30d: number }`

**Caching:** Recomputed daily; cached result used otherwise.

**Used by:** Workspace health dashboard, `workspace_health()`

---

#### Function 6: `workspace_health(workspace)`

**Input Objects:** `Workspace`, pulls from `pipeline_velocity()`, `deliverability_health()`, `strategy_freshness()`

**Computation Logic**

Aggregates five sub-scores: (1) Pipeline Velocity score (from `pipeline_velocity()` trend: accelerating = 100, stable = 70, decelerating = 40), (2) Sender Pool Health (from `deliverability_health()` pool_score), (3) Strategy Freshness (from `strategy_freshness()` staleness_score), (4) Signal Coverage (% of active organizations with ≥1 signal in past 30 days × 100), (5) Engagement Rate (replies + meetings / sends in past 30 days × 100, capped at 100). Weights: 25%, 20%, 15%, 20%, 20%. Returns composite score and per-dimension breakdown.

**Output:** `{ overall_score: number, dimensions: { pipeline: number, senders: number, strategy: number, signals: number, engagement: number }, alerts: string[] }`

**Caching:** 6-hour TTL.

**Used by:** Workspace overview dashboard, `churn_risk()`

---

#### Function 7: `signal_relevance(signal, workspace)`

**Input Objects:** `Signal`, `Workspace` (including active `Strategy` and `Thesis[]`)

**Computation Logic**

Extracts workspace's active thesis keywords, target verticals, and ICP attributes. Scores the signal on four axes: (1) Organization match — is the signal's organization in the workspace's target account list (binary, ×2 multiplier), (2) Signal type priority — workspace configures signal type weights (e.g., funding = 0.9, hiring = 0.7, product_launch = 0.6); retrieves configured weight, (3) Thesis alignment — keyword overlap between signal summary and thesis statement (TF-IDF-style token matching, 0–1 score), (4) Recency — exponential decay: score × e^(−λt) where t = hours since detected and λ = 0.02. Multiplies all factors, normalizes to 0–100.

**Output:** `number` (0–100 float). Scores above 70 are surfaced as priority signals in the UI.

**Caching:** Not cached (computed at signal creation and on-demand).

**Used by:** `fire_signal`, `score_readiness`, Signal feed ranking

---

#### Function 8: `strategy_freshness(strategy)`

**Input Objects:** `Strategy`, `Workspace`, `Signal[]` (recent, post-strategy-creation)

**Computation Logic**

Computes base staleness from age: each day past 30 days since `Strategy.generated_at` decays the freshness score by 2 points (100 at day 0, 40 at day 30). Adjusts for signal drift: counts signals fired after `generated_at` with `relevance_score > 70` that contain entity or theme keywords not present in the strategy's theses; each such signal decays freshness by an additional 3 points. Returns a freshness score and a boolean `recommend_refresh` flag.

**Output:** `{ freshness_score: number, days_since_generated: number, new_high_relevance_signals: number, recommend_refresh: boolean }`

**Caching:** Recomputed daily.

**Used by:** `workspace_health()`, Strategy panel (surfaces "Strategy may be stale" warning)

---

#### Function 9: `message_quality_score(message)`

**Input Objects:** `Message` (body text), `Contact` (role, seniority), `Organization` (readiness_tier)

**Computation Logic**

Passes message body to Claude Haiku with a structured evaluation rubric: (1) Specificity — does it reference a concrete signal or company fact (0–25 pts), (2) Relevance — is the opening relevant to the contact's function (0–25 pts), (3) Clarity — is the value implication stated clearly without jargon (0–25 pts), (4) CTA appropriateness — is the ask calibrated to readiness tier (no demo asks for Cold/Warming: 0–15 pts), (5) Length discipline — penalty for messages over 90 words (−10 pts per 10 words over). Returns integer 0–100 and per-dimension scores.

**Output:** `{ total: number, specificity: number, relevance: number, clarity: number, cta_fit: number, length_penalty: number, flags: string[] }`

**Caching:** Not cached (evaluated at draft time).

**Used by:** `draft_message`, Message quality indicator in Composer

---

#### Function 10: `sequence_performance(sequence)`

**Input Objects:** `Sequence`, `SequenceStep[]`, `Message[]`, `Outcome[]`

**Computation Logic**

Groups messages by step number within the sequence. For each step, computes: send count, connection acceptance rate (if step 1), reply rate, meeting conversion rate. Identifies drop-off steps (where reply rate drops by >50% relative to previous step). Computes overall sequence metrics: total sends, aggregate reply rate, meeting rate, and estimated time-to-first-reply (median). Compares to workspace average for same period.

**Output:** `{ sequence_id: UUID, steps: StepMetrics[], overall_reply_rate: number, meeting_rate: number, median_days_to_reply: number, drop_off_step: number | null, vs_workspace_avg: { reply_rate_delta: number, meeting_rate_delta: number } }`

**Caching:** Cached for 24 hours, invalidated on new Outcome linked to sequence.

**Used by:** Sequence analytics view, `angle_effectiveness()`

---

#### Function 11: `account_engagement_score(organization)`

**Input Objects:** `Organization`, `Message[]`, `Outcome[]`, `Signal[]`

**Computation Logic**

Computes a rolling 90-day engagement composite across three vectors: (1) Outreach responsiveness — replies / sends for the account × 40 points, (2) Meeting conversion — meetings / replies × 30 points, (3) Signal activity — count of signals above 0.65 confidence in 90 days, logarithmically scaled to 30 points (ln(n+1) / ln(11) × 30). Adds 10-point bonus if a `Circleback` meeting note is linked in the past 30 days. Normalizes to 0–100.

**Output:** `number` (0–100). Used to prioritize accounts in workspace queue.

**Caching:** Recomputed nightly; invalidated on new Outcome.

**Used by:** Account prioritization sort, Workspace pipeline view

---

#### Function 12: `icp_fit_score(organization, intake)`

**Input Objects:** `Organization`, `Intake`

**Computation Logic**

Extracts ICP criteria from `Intake`: target industries (array), employee count range `[min, max]`, revenue range, required/excluded tech stack items, geographies, and any freeform criteria. Scores organization on binary and continuous axes: industry match (binary, 30 pts if match, −20 if excluded), employee count within range (linear interpolation: 25 pts at center of range, 0 pts at ±50% of range), revenue range match (15 pts), tech stack required items present (5 pts each, max 20 pts), geography match (10 pts). Caps at 100.

**Output:** `number` (0–100). Scores below 40 flag the account as outside ICP and surface a warning in the UI.

**Caching:** Cached per `(organization_id, intake_id)` pair, invalidated on Organization enrichment update or Intake modification.

**Used by:** `score_readiness`, `run_strategy`, ICP alignment indicator on Account card

---

#### Function 13: `churn_risk(workspace)`

**Input Objects:** `Workspace`, `workspace_health()` output, `Outcome[]`, `SyncLog[]`

**Computation Logic**

Evaluates six churn indicators with weights: (1) `workspace_health()` score below 40 (high risk signal, 30 pts), (2) No meeting booked in past 45 days (25 pts), (3) CRM sync auth error persisting >7 days (15 pts), (4) Strategy freshness below 30 (15 pts), (5) Sender pool healthy count below 3 (10 pts), (6) No user login in past 14 days (5 pts). Sums applicable points to a risk score 0–100. Classifies: Low (<30), Medium (30–59), High (60–100).

**Output:** `{ risk_score: number, risk_tier: string, risk_factors: string[], recommended_actions: string[] }`

**Caching:** Recomputed daily.

**Used by:** Internal CS dashboard, automated health alert system

---

#### Function 14: `angle_effectiveness(angle, vertical)`

**Input Objects:** `Angle` (angle_type string), `Vertical` (industry vertical string), `Outcome[]`, `Message[]`

**Computation Logic**

Filters `Message` objects by `angle_type` and linked `Organization.industry` matching `vertical`. Groups by `angle_type`, computes: send count, reply rate, meeting conversion rate, and average `message_quality_score` for messages using that angle in that vertical. Requires minimum 10 sends for statistical validity; angles with fewer sends return `insufficient_data`. Ranks angles by a composite effectiveness score: reply_rate × 0.5 + meeting_rate × 0.5. Returns ranked list with confidence intervals.

**Output:** `{ angle_type: string, vertical: string, send_count: number, reply_rate: number, meeting_rate: number, effectiveness_score: number, confidence: "high"|"medium"|"low"|"insufficient_data" }[]`

**Caching:** Cached for 24 hours.

**Used by:** `run_strategy` (angle selection), `promote_to_canonical`, Playbook analytics view

---

#### Function 15: `win_rate_by_segment(segment)`

**Input Objects:** `Segment`, `Outcome[]`, `Organization[]`

**Computation Logic**

Filters `Organization` objects matching `Segment` criteria (industry, size band, geography). For each organization, determines win status from `Outcome` data: a "win" is defined as any organization with ≥1 `meeting_booked` outcome and a subsequent `Thesis.status = "ratified"` within the same workspace. Computes win rate = wins / total targeted organizations × 100. Breaks down by sub-segment (industry vertical within segment, size band). Returns historical trend by quarter if data spans >90 days.

**Output:** `{ segment_id: UUID, total_accounts: number, win_count: number, win_rate: number, breakdown_by_vertical: Record<string, number>, breakdown_by_size: Record<string, number>, trend: QuarterlyWinRate[] }`

**Caching:** Cached for 24 hours.

**Used by:** Segment performance reporting, `run_strategy` (cadence calibration)

---

## SECTION E — IMPLEMENTATION PLAN

---

### E.1 Current Stack Assessment

An honest evaluation of the existing codebase — what stays, what must change, and why.

| Component | Current State | Decision | Rationale |
|---|---|---|---|
| **Vercel Hobby Plan** | 10-second serverless timeout | **Upgrade to Vercel Pro ($20/mo)** | `run_strategy`, `scan_intelligence`, and `sync_crm` routinely exceed 10s. Pro plan provides 60s timeout and removes the single-function constraint. |
| **Single serverless function** | All routes in one `api/index.js` | **Split into route-specific functions** | Monolithic handler causes cold-start bloat, prevents per-route timeout tuning, and makes deployment rollbacks all-or-nothing. Each action group becomes its own Vercel function. |
| **In-browser Babel transpilation** | 3,868-line `index.html` with runtime Babel | **Migrate to Next.js App Router** | In-browser Babel is incompatible with code splitting, SSR, and any meaningful build pipeline. This is the highest-risk refactor but is prerequisite to all subsequent work. |
| **Neon PostgreSQL — JSON blobs** | Denormalized data in JSON columns | **Normalize to relational schema** | JSON blobs prevent indexed queries, make signal aggregations table-scans, and block efficient `win_rate_by_segment()` computation. New schema defined in E.2. |
| **SHA-256 password hashing** | `crypto.createHash('sha256')` | **Migrate to bcrypt (cost factor 12)** | SHA-256 is cryptographically unsuitable for passwords (no salt, no work factor). Migration: on next login, verify SHA-256, re-hash with bcrypt, update stored hash. |
| **Google OAuth — no JWT verification** | OAuth tokens accepted without server-side verification | **Implement `google-auth-library` token verification** | Currently trusting client-supplied identity. Must verify `id_token` against Google's JWKS endpoint server-side before creating sessions. |
| **HeyReach MCP integration** | Referenced in marketing materials; not in codebase | **Implement HeyReach REST API client** | MCP integration must be built. Prioritize in Sprint 2. Requires HeyReach API credentials and webhook endpoint for outcome delivery. |
| **Circleback** | Meeting notes referenced but integration unclear | **Implement Circleback webhook receiver** | On meeting completion, Circleback POSTs a structured notes payload. Add webhook endpoint to parse and link notes to `AccountBrief` objects. |
| **Authentication sessions** | Unknown mechanism | **Implement JWT-based sessions (jose library)** | Stateless JWT with 24h access tokens and 30-day refresh tokens. Store refresh tokens in `sessions` table for revocation support. |

**What stays unchanged:**
- Neon PostgreSQL as the database (strong Vercel integration, generous free tier scales adequately to 50K rows per table at current growth)
- Claude Sonnet/Haiku for AI (keep dual-model pattern: Haiku for classification/scoring, Sonnet for generation)
- OpenAI fallback (retain, triggered by Claude 5xx or rate limit)
- Vercel as deployment target (Pro tier resolves the functional blockers)

---

### E.2 Recommended Migration Path

**Guiding principle:** Ship value at each phase. No big-bang rewrites. The React SPA remains functional throughout migration via parallel routing — new Next.js pages are added alongside the existing SPA, which is progressively replaced.

#### Phase 1 — Infrastructure (Weeks 1–4)

1. Upgrade Vercel to Pro.
2. Create `apps/web` (Next.js 14, App Router) alongside existing `index.html` in monorepo.
3. Configure Neon branching: `main` for production, `dev` for migration work.
4. Implement bcrypt password migration (login-time re-hashing).
5. Add Google OAuth JWT verification via `google-auth-library`.
6. Split `api/index.js` into route-specific Vercel functions: `/api/auth/*`, `/api/workspaces/*`, `/api/organizations/*`, `/api/signals/*`, `/api/messages/*`.

#### Phase 2 — Schema Normalization (Weeks 3–6)

New tables replacing / supplementing JSON blob structure:

```sql
-- Core new tables
signals          (id, org_id, type, summary, source_url, confidence, relevance_score, detected_at)
theses           (id, strategy_id, statement, angle_type, situation_claim, status, ratified_at)
messages         (id, org_id, contact_id, thesis_id, signal_id, body, quality_score, status, sent_at)
outcomes         (id, message_id, type, occurred_at)
sender_accounts  (id, workspace_id, heyreach_account_id, health_score, health_tier, daily_send_count)
buying_committee (id, org_id, deal_type, roles jsonb, inferred_at)
playbook_entries (id, body, angle_type, vertical, segment_id, source_message_id, promoted_at)
scan_runs        (id, workspace_id, orgs_scanned, signals_fired, tokens_consumed, completed_at)
sync_logs        (id, workspace_id, crm_type, direction, records_pushed, errors jsonb, synced_at)
account_briefs   (id, org_id, workspace_id, content_md, pdf_url, generated_at)
```

Data migration: write idempotent migration scripts that read existing JSON blobs and INSERT into normalized tables. Run on Neon dev branch, verify with row counts and spot checks, then apply to production during a maintenance window.

#### Phase 3 — Application Build-out (Weeks 5–12)

New modules built on top of normalized schema, delivered as Next.js pages and API routes. Existing SPA pages are deprecated as equivalent Next.js pages ship.

---

### E.3 90-Day Sprint Plan

---

#### Sprint 1 (Days 1–30): Foundation

**Objective:** Establish a secure, scalable infrastructure foundation and migrate the existing application to Next.js without regressing any current user-facing functionality.

**Deliverables**

| # | Deliverable | Detail |
|---|---|---|
| 1 | Next.js 14 application shell | App Router, TypeScript, Tailwind CSS, shadcn/ui component library. Routes mirror current SPA: `/workspaces`, `/workspaces/[id]`, `/accounts/[id]`. |
| 2 | Auth system replacement | `next-auth` with Google OAuth provider + credentials provider. JWT sessions (24h access, 30d refresh). bcrypt migration on login. Google `id_token` verified via `google-auth-library`. |
| 3 | Vercel Pro + function split | 6 route-specific Vercel functions replacing monolithic handler. Per-function timeout config (60s for AI routes, 30s for data routes). |
| 4 | Schema normalization — Phase 1 tables | `signals`, `theses`, `messages`, `outcomes`, `sender_accounts` tables created and backfilled from JSON blobs. |
| 5 | Core API layer | REST endpoints for Workspace CRUD, Organization CRUD, Signal list/create. Zod validation on all inputs. |
| 6 | Existing SPA feature parity | All current pages functional in Next.js. Old `index.html` served at `/legacy` as fallback until parity confirmed. |

**Technical Tasks**

- Initialize `pnpm` monorepo: `apps/web` (Next.js), `packages/db` (Drizzle ORM schema), `packages/ai` (Claude/OpenAI client wrappers)
- Configure Drizzle ORM with Neon serverless driver (`@neondatabase/serverless`)
- Write and run migration scripts: `migrate_signals.ts`, `migrate_messages.ts`
- Implement `POST /api/auth/google` with server-side token verification
- Set `bcryptjs` cost factor 12; add `password_hash_version` column to `users` table
- Set up Vercel project with function configs in `vercel.json`
- Configure Sentry for error tracking (Next.js SDK)

**Dependencies**
- Vercel Pro plan activated (Day 1)
- Neon `dev` branch created and credentials distributed
- Google OAuth client ID/secret migrated to new environment variables

**Risk Factors**

| Risk | Likelihood | Mitigation |
|---|---|---|
| JSON blob migration data loss | Medium | Run migration on Neon dev branch; compare row counts + spot-check 50 random records before production cutover |
| Next.js parity gaps causing user disruption | High | Keep legacy `index.html` at `/legacy`; do not deprecate until each section is explicitly verified |
| bcrypt migration locking out users | Low | Login-time re-hashing means no forced logout; SHA-256 path remains active until all users have re-logged in |

**Success Criteria**
- All existing user workflows functional in Next.js
- Zero SHA-256 password hashes in `users` table for active users (users who have logged in since migration)
- All 6 Vercel functions deploy independently
- `signals`, `messages`, `outcomes` tables populated with backfilled data
- Zero authentication bypass vulnerabilities (verified by manual pen test of auth endpoints)

---

#### Sprint 2 (Days 31–60): Intelligence & Activation

**Objective:** Build the intelligence engine (AI strategy generation, signal scanning, account scoring) and the activation layer (HeyReach integration, message composer, sequence builder).

**Deliverables**

| # | Deliverable | Detail |
|---|---|---|
| 1 | `run_strategy` action + UI | Two-part strategy generation flow. Strategy view showing ranked theses, angle suggestions, and `thesis_fit_score` per account. |
| 2 | `scan_intelligence` + `fire_signal` | Scheduled scan job (Vercel Cron, daily). Brave Search API integration. Signal feed UI with relevance ranking. |
| 3 | `score_readiness` + account scoring | Nightly scoring job. Readiness tier badge on Account cards. Tier-filtered account list view. |
| 4 | HeyReach integration | HeyReach REST API client in `packages/heyreach`. `send_via_heyreach` action. Webhook endpoint `POST /api/webhooks/heyreach` for outcome delivery → `log_outcome`. Sender health dashboard. |
| 5 | Message Composer | Draft interface: account + signal + thesis + angle selection → `draft_message` → quality score display → approve → `send_via_heyreach`. |
| 6 | `enrich_account` | Clearbit + BuiltWith integration. Enrichment triggered on Organization creation. Manual refresh button. |
| 7 | `map_committee` + Committee view | Buying committee display on Account detail. Gap identification. |
| 8 | Circleback webhook | `POST /api/webhooks/circleback` receiver. Parse meeting notes, link to `AccountBrief` via organization domain match. |

**Technical Tasks**

- Implement `packages/ai/strategy.ts`: prompt templates for thesis generation and assembly
- Implement `packages/ai/scorer.ts`: `thesis_fit_score`, `icp_fit_score`, `message_quality_score` using Claude Haiku
- Set up Vercel Cron: `0 2 * * *` → `/api/cron/scan-intelligence`, `0 3 * * *` → `/api/cron/score-readiness`
- Implement Brave Search API client with rate-limit handling and quota tracking per `ScanRun`
- Build `packages/heyreach/client.ts`: typed REST client for HeyReach API (send message, get account status, list campaigns)
- Add `sender_accounts` table rows seeded from HeyReach account list (manual import or HeyReach list API)
- Build `POST /api/webhooks/heyreach`: verify HeyReach webhook signature, parse payload, call `log_outcome`
- Implement `score_sender_health` scheduled job: `0 */6 * * *`
- Add `buying_committee` table (Sprint 1 schema addition) and `map_committee` endpoint
- Implement Circleback webhook handler with domain-based organization matching

**Dependencies**
- HeyReach API credentials and webhook secret (required from HeyReach vendor)
- Brave Search API key
- Clearbit API key (or alternative enrichment provider)
- Circleback webhook configuration (requires Circleback account access)
- Sprint 1 `signals`, `messages`, `sender_accounts` tables in production

**Risk Factors**

| Risk | Likelihood | Mitigation |
|---|---|---|
| HeyReach API undocumented or unstable | Medium | Build adapter interface `ILinkedInSender` so HeyReach can be swapped without touching business logic |
| Brave Search quota exhaustion on large account lists | Medium | Implement per-workspace daily query budget; defer low-priority accounts to next scan window |
| Claude Sonnet latency causing 60s timeout on `run_strategy` | Low-Medium | Implement streaming response for strategy UI; break into two sequential API calls if needed |
| Circleback webhook payload format change | Low | Store raw payload in `account_briefs.raw_circleback_payload` JSONB column for replay |

**Success Criteria**
- `scan_intelligence` runs on schedule with zero unhandled errors for 7 consecutive days
- `send_via_heyreach` successfully delivers messages via HeyReach for at least one test sender account
- HeyReach reply webhook correctly creates `Outcome` records
- `run_strategy` completes in <55s for a workspace with 20 accounts
- Account readiness scores populated for 100% of active workspace accounts
- Message quality score displayed in Composer for every draft

---

#### Sprint 3 (Days 61–90): Loop & Scale

**Objective:** Close the feedback loop (outcome tracking → thesis ratification → playbook promotion), add CRM sync, build reporting, and implement multi-workspace scale features.

**Deliverables**

| # | Deliverable | Detail |
|---|---|---|
| 1 | Outcome tracking + feedback loop UI | Outcome feed per account. `ratify_thesis` action with auto-threshold check. `ratified` badge on thesis cards. |
| 2 | `promote_to_canonical` + Playbook | Playbook library view: browseable by vertical + angle. Promoted templates surfaced in Composer. `angle_effectiveness()` report. |
| 3 | `generate_brief` + PDF export | One-page account brief generation. PDF download via `@react-pdf/renderer`. Pre-meeting brief trigger via Circleback event. |
| 4 | CRM sync — Salesforce + HubSpot | OAuth connection flow for each CRM. Field mapping configuration UI. `sync_crm` scheduled job (every 4h). Sync status indicator. |
| 5 | Workspace health dashboard | `workspace_health()` composite score. Per-dimension breakdown. Alert surface for `churn_risk()` High tier workspaces. |
| 6 | Sequence builder | Multi-step sequence definition. `SequenceStep` table. `sequence_performance()` analytics. Step-level drop-off visualization. |
| 7 | Analytics & reporting | Win rate by segment (`win_rate_by_segment()`). Pipeline velocity chart (`pipeline_velocity()`). Sender pool health table. Signal source attribution. |
| 8 | `archive_workspace` + workspace management | Archive flow with grace period. Admin workspace list with health scores. |
| 9 | Multi-workspace performance | Query optimization: add indexes on `(org_id, created_at)` for signals/messages/outcomes. Connection pooling via PgBouncer on Neon. |

**Technical Tasks**

- Implement `ratify_thesis` endpoint with auto-threshold computation against `outcomes` table
- Build `playbook_entries` table and Playbook API (`GET /api/playbook?vertical=&angle_type=`)
- Integrate `@react-pdf/renderer` for brief PDF generation; store PDF in Vercel Blob storage
- Implement Salesforce OAuth flow: `salesforce-marketing-cloud` SDK or direct REST with `jsforce`
- Implement HubSpot OAuth flow: `@hubspot/api-client`
- Build field mapping config stored in `workspace_settings` JSONB column
- Implement `sync_crm` as a Vercel Cron function: `0 */4 * * *`
- Build `SequenceStep` table and sequence execution engine (step scheduling via Vercel Cron or a simple `next_step_at` polling approach)
- Add database indexes: `CREATE INDEX CONCURRENTLY idx_signals_org_created ON signals(org_id, detected_at DESC)`, same pattern for `messages` and `outcomes`
- Configure PgBouncer connection pooling on Neon (available in Neon Pro)
- Implement `churn_risk()` computation as a daily job that writes to `workspace_health_scores` table
- Build internal CS dashboard (admin-only route): workspace list sorted by churn risk

**Dependencies**
- Salesforce developer org credentials for OAuth app registration
- HubSpot developer account for OAuth app
- Vercel Blob storage enabled (for PDF storage)
- Sprint 2 HeyReach integration stable and in production
- `ratify_thesis` requires sufficient outcome data (at least one workspace with >20 sends)

**Risk Factors**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Salesforce OAuth approval delay | Medium | Begin Salesforce Connected App registration in Sprint 2 week 2 (approval can take 5–7 days) |
| PDF rendering performance on Vercel (cold start + render time) | Medium | Pre-generate briefs asynchronously; serve from Vercel Blob cache; avoid on-demand PDF generation in the critical path |
| Sequence scheduling drift under load | Medium | Use database-backed `next_step_at` polling (every 15min cron) rather than in-memory scheduling; idempotency key on each send |
| CRM field mapping conflicts across customers | High | Store field maps per-workspace; provide sane defaults; do not auto-map custom fields without user confirmation |

**Success Criteria**
- At least one thesis ratified end-to-end via auto-threshold in a live workspace
- At least one message promoted to Playbook via `promote_to_canonical`
- CRM sync completes bidirectional cycle for Salesforce and HubSpot test workspaces without data loss
- `generate_brief` PDF export working for all active workspaces
- `workspace_health()` dashboard live with per-dimension scores for all workspaces
- All `signals`, `messages`, `outcomes` queries return in <200ms at p95 on Neon with new indexes
- Sequence builder functional with at least 3-step sequences deployable via HeyReach

---

### E.4 Migration Risk Register

| Risk | Sprint | Severity | Owner | Status |
|---|---|---|---|---|
| In-browser Babel removal breaks existing users | 1 | High | Engineering Lead | Mitigated: legacy fallback route |
| HeyReach API contract changes | 2 | High | Backend Eng | Mitigated: adapter interface pattern |
| JSON blob backfill data corruption | 1 | High | Data Eng | Mitigated: Neon branch + validation scripts |
| Google OAuth JWT bypass still exploitable during migration | 1 | Critical | Security | Priority fix, Day 1 |
| bcrypt migration causes user lockouts | 1 | Medium | Backend Eng | Mitigated: login-time re-hash, no forced logout |
| Vercel 60s timeout still insufficient for large scans | 2 | Medium | Backend Eng | Mitigated: chunked scan with continuation tokens |
| CRM OAuth apps not approved in time | 3 | Medium | Product | Mitigated: begin registration in Sprint 2 |
| Neon connection exhaustion under concurrent load | 3 | Medium | Infra | Mitigated: PgBouncer pooling in Sprint 3 |

---

### E.5 Key Technical Decisions Log

| Decision | Rationale | Alternative Considered | Why Rejected |
|---|---|---|---|
| Next.js App Router (not Pages Router) | Server Components reduce client bundle; RSC-compatible with streaming AI responses | Pages Router | Legacy routing, no streaming support |
| Drizzle ORM (not Prisma) | Lightweight, Neon serverless driver compatible, type-safe SQL without heavy codegen | Prisma | Cold-start overhead, Neon driver compatibility friction |
| Vercel Cron for scheduled jobs | Zero additional infra; integrates with existing Vercel deployment | Inngest, BullMQ | Inngest adds cost and dependency; BullMQ requires Redis |
| `@neondatabase/serverless` driver | Neon's own HTTP-over-WebSocket driver designed for serverless cold starts | `pg` (node-postgres) | `pg` holds TCP connections incompatible with serverless function lifecycle |
| bcrypt cost factor 12 | OWASP recommendation for general web auth at current hardware speeds | Argon2id | Argon2id is preferable long-term; bcrypt chosen for ecosystem familiarity and npm package stability |
| Vercel Blob for PDF storage | Integrated with Vercel deployment, no additional auth config | S3, Cloudflare R2 | Both require additional IAM/credential management; Vercel Blob uses same deployment token |


---

# Ridge Platform Expansion Brief
## Section F — IP and Moat Analysis
## Section G — Risks, Open Questions, and Kill Criteria

---

# SECTION F — IP AND MOAT ANALYSIS

## F.1 Competitive Landscape

The table below maps each major competitor across the dimensions most relevant to Ridge's positioning. Assessments reflect publicly available pricing data and product capabilities as of 2025–2026; AI layer and architecture assessments are based on published feature sets and integration disclosures.

| Competitor | Primary Function | Data Moat | AI Layer | Write-Back Loop | Multi-App Architecture | Price Point |
|---|---|---|---|---|---|---|
| **ZoomInfo** | B2B contact/company database + GTM workflows | Strongest in market: 300M+ contacts, proprietary intent network (Bombora partnership), first-party web tracking via VisitorIQ | Copilot (launched Oct 2025): account summaries, buying group ID, generative email across tiers | Chorus (conversation intelligence) feeds back into deal scoring; limited closed loop | Single platform with add-on modules (Engage, Chorus, Intent); not a true suite on shared layer | $15K–$60K+/yr; enterprise contracts $30K–$300K |
| **Apollo.io** | Prospecting database + sales engagement sequences | Large community-contributed database (~275M contacts); community data quality is inconsistent | AI email writing, AI-assisted sequences; basic intent signals | Sequences close loop on open/click activity only; no strategy-level feedback | Single app with CRM sync; add-ons via marketplace | $49–$119/user/mo; most competitive SMB price point |
| **Clay** | Data enrichment workflow builder | No proprietary data; aggregator of 75+ third-party providers via waterfall enrichment | Claymation AI agent for research and personalization | No loop; output is enriched rows exported to sequences | Single workflow tool; integrates with everything but owns nothing | Credit-based; expensive at scale; teams report $2K–$10K/mo+ |
| **Pocus** | Product-Led Sales (PLS) signal routing | First-party product usage data from client's own data warehouse; no proprietary external data | AI scoring models for PQL identification; playbook recommendations | PQL signals update scoring models; tightest loop of any listed competitor but scoped to product-usage signals only | Single app; no shared semantic layer; purpose-built for PLG companies | Not publicly disclosed; estimated $30K–$100K/yr |
| **Salesmotion** | Signal-driven account intelligence | No proprietary data; monitors 1,000+ public sources in real time | Three-agent model (Signal Agent, Research Agent, Outreach Agent); generates cited account briefs | No loop; output is briefs and drafts | Single app; closest functional overlap with Ridge's intelligence feed | From $85/mo individual; $990/mo teams (unlimited users) |
| **6sense** | Predictive ABM + intent-driven account identification | Proprietary intent network across B2B web properties; predictive scoring on 40+ buying signals | Account scoring, predictive pipeline, Conversational Email | Ad platform creates partial loop (retargeting based on intent stage); no strategy feedback | Modular platform (Sales Intelligence, Advertising, Conversational Email); modules are additive, not on a shared ontology | $60K–$300K+/yr; TAM-based pricing |
| **Demandbase** | ABM platform + sales intelligence | Intent data network; technographic database; company graph | Predictive scoring, generative account summaries, AI-assisted targeting | Ad retargeting and CRM sync; no closed-loop thesis validation | Platform approach with modular add-ons; similar to 6sense architecture | $24K–$300K+/yr; median contract ~$58K |
| **Draup** | Enterprise sales + talent intelligence | Proprietary workforce/skills taxonomy from 75K+ data sources; strongest labor-market moat in the list | AI account dossiers, stakeholder influence mapping, predictive market analytics | No feedback loop; output is static dossiers | Single platform combining two domains (sales + HR); not architected as a suite | Custom; ~$75K/yr for 5–10 users per AWS Marketplace listing |
| **Gong** | Revenue intelligence / conversation analytics | Proprietary conversation data network from millions of recorded calls; a genuine data flywheel | Call transcription, deal risk scoring, pipeline forecasting; market-leading depth | Conversation outcomes feed coaching models and deal scores; strong loop within call data | Single app; integrates with sequences tools but does not own that layer | $1,300–$3,000/user/yr; enterprise contracts $100K+ |
| **Outreach** | Sales engagement sequences + pipeline management | Minimal proprietary data; depends on CRM and external enrichment sources | Kaia AI (real-time call assistant); AI-assisted email drafting; deal health scoring | Sequence engagement data updates deal health scores; limited strategy feedback | Single engagement platform; integrates widely but not a multi-app suite | Custom enterprise pricing; estimated $100–$150/user/mo |
| **Salesloft** | Sales engagement + conversation intelligence (merged with Clari Dec 2025) | Clari acquisition adds pipeline data moat; Salesloft has engagement data on sender/recipient patterns | Conductor AI for deal prioritization; AI call scoring; buying group auto-capture | Conversation outcomes feed Rhythm workflow prioritization; stronger loop post-Clari merger | Merging two single apps (Salesloft + Clari); not architected on a shared semantic layer | Custom enterprise; estimated $125–$200/user/mo combined stack |
| **Ridge** | AI strategy suite + intelligence + activation on shared semantic layer | No proprietary data asset (honest assessment); depends on web AI search and workspace-scoped signals | Multi-model, multi-phase strategy generation (11 sections); intelligence scoring against workspace ICP; AI draft generation | Strategy → signals → outreach draft → (planned) outcome validation → thesis refinement; the most complete closed loop in the category | **Only competitor architected as a true application suite on a shared ontology/semantic layer** | Not yet validated; managed-service pricing under development |

**Where Ridge wins:** Architectural coherence. Every other competitor is a point solution that integrates with other point solutions. Ridge is the only platform where strategy generation, signal intelligence, and activation share a single semantic layer, meaning that enrichment done in intake is available natively to the intelligence feed, which is available natively to draft generation, without data transformation or API glue.

**Where Ridge is behind:** Data assets (Ridge has none of ZoomInfo's 300M contacts, Gong's conversation corpus, or 6sense's intent network), user base (Ridge is pre-scale), and brand recognition. These are not permanent disadvantages, but they are real and should not be minimized when communicating with enterprise buyers who ask about data provenance.

---

## F.2 Ridge's Defensible Differentiators

### Differentiator 1 — Ontology-Native Application Architecture

**What it is:** Ridge's product suite is not a collection of integrations between separate apps. Every module — strategy generation, intelligence feed, account management, client portal, sender management — reads from and writes to a single shared semantic layer (the Ridge Ontology). An account's ICP, buyer personas, messaging thesis, and live signals are all first-class objects in that ontology, accessible to every application without API translation.

**Why it's defensible:** Point solutions that want to replicate this cannot bolt it on retroactively. Their data models are product-scoped (Gong's data model is built around calls; Outreach's is built around sequences). Rebuilding the data model would break existing customers. Any competitor that wants to match this must either acquire and rebuild, or start from scratch — both paths take years and destroy customer trust during the transition.

**Time to replicate:** 3–5 years for a well-funded competitor starting from a single-app base. 18–24 months if they start greenfield and have deep engineering resources. The organizational challenge (convincing existing customers to migrate to a new data model) is likely harder than the engineering challenge.

**Dependency chain:** This moat holds as long as (a) Ridge continues to develop multiple applications on the shared layer rather than building disconnected modules, (b) the ontology schema is kept coherent as the product scales, and (c) Ridge adds real data weight (client accounts, strategies, outcome history) to the ontology so that migrating away becomes costly.

---

### Differentiator 2 — Closed-Loop Thesis Validation Engine

**What it is:** Every engagement strategy Ridge generates is anchored to one or more explicit theses ("This company is investing in AI infrastructure; our product reduces AI deployment time"). The Loop module tracks whether the signal that originated the thesis actually leads to a drafted message, whether that draft leads to a sent sequence, and whether that sequence leads to a response or conversion. Theses that do not convert are flagged for invalidation; theses that do convert are promoted and applied to similar accounts.

**Why it's defensible:** No other competitor closes this loop at the thesis level. Apollo and Outreach close the loop at the activity level (sent/opened/replied). Gong closes the loop at the conversation level. 6sense closes the loop at the intent-stage level. None of them validate whether the strategic premise was correct. Ridge is the only platform where "why we reached out" is a tracked and evaluated data object.

**Time to replicate:** This is a product design choice, not just an engineering problem. A competitor would need to: (1) capture strategic theses at the time of strategy generation, (2) tag every downstream action to the originating thesis, (3) build an outcome-attribution model that accounts for multi-touch sequences. A well-funded competitor with the right design intent could build this in 12–18 months. The current gap exists because no competitor is even attempting it.

**Dependency chain:** Requires Ridge's strategy generation module to produce structured, trackable theses (not free-text). Requires activation to be logged at the workspace level. Requires a meaningful volume of completed cycles (signal → message → outcome) to produce statistically valid validation signals — approximately 200–500 outcomes per vertical before the thesis engine becomes reliable.

---

### Differentiator 3 — Workspace-Scoped Intelligence (Contextualized ICP Scoring)

**What it is:** Ridge's intelligence feed does not generate generic alerts. It builds search queries from each workspace's specific account data, ICP definition, buyer personas, and active strategy theses, then scores incoming signals against that workspace context. A signal that is high-relevance for a cybersecurity software client may be zero-relevance for a logistics client — Ridge makes this distinction at query construction time, not at filter time.

**Why it's defensible:** Competitors like Salesmotion, Demandbase, and ZoomInfo produce signals at the platform level and let users filter down. Ridge produces signals at the workspace level from the start. This means Ridge's signal-to-noise ratio compounds over time as the workspace accumulates context. The personalization is structural, not superficial.

**Time to replicate:** Moderate — a well-resourced competitor could build workspace-scoped query construction in 6–12 months. The real barrier is the semantic layer that makes context available at query time without manual configuration per account. That layer takes longer to build correctly.

**Dependency chain:** Requires the Ridge Ontology to hold structured ICP, persona, and thesis data at workspace scope. Requires the intelligence feed to consume ontology data at query-construction time (not post-retrieval filter). Degrades if workspace data is sparse or poorly structured.

---

### Differentiator 4 — Cross-Workspace Vertical Learning with Data Isolation (Atlas)

**What it is:** The Atlas module aggregates pattern-level learnings across all Ridge workspaces that share a vertical (e.g., all clients selling into mid-market healthcare IT) to surface insights that no single workspace could generate alone — which thesis patterns convert, which signal types predict buying intent, which message frameworks perform. Atlas does this without exposing any workspace-specific data to other workspaces: the learning layer operates on anonymized pattern hashes, not raw account or message data.

**Why it's defensible:** This is an emergent network effect that Ridge accrues as it adds clients. The more clients in a vertical, the better Atlas's pattern library, the better Ridge's strategy generation for new clients in that vertical. Competitors cannot replicate the pattern library without having the same client base. Furthermore, the privacy-preserving aggregation mechanism is itself protectable.

**Time to replicate:** The aggregation mechanism could be built in 3–6 months. The pattern library cannot be replicated — it requires real client data over time. A competitor starting today would need 2–3 years of client operation in a vertical to match a Ridge that has been operating for 12 months.

**Dependency chain:** Requires a meaningful number of clients per vertical (minimum viable signal: approximately 5–8 clients in a vertical with 6+ months of outcome data). Requires the privacy-preserving aggregation to be airtight — a data leak would destroy the moat and the business simultaneously.

---

### Differentiator 5 — Signal-to-Draft-to-Send Pipeline (Integrated Activation)

**What it is:** Ridge's intelligence feed does not terminate at an alert or a dashboard notification. Every signal Ridge surfaces can be expanded directly into a contextual outreach draft — anchored to the signal, the account's strategy thesis, and the specific persona being targeted — and can be routed directly into a sender-optimized sequence. The pipeline from "signal detected" to "message in queue" is native, not routed through a third-party integration.

**Why it's defensible:** Every competitor requires at least one handoff: Salesmotion generates briefs but hands off to Outreach or Apollo for sending. 6sense generates intent signals but hands off to Salesloft for sequencing. Each handoff is a data translation and a friction point. Ridge eliminates the handoff. This is not just a UX advantage — it means Ridge's outreach quality is governed by the same semantic context as its strategy, rather than by what survives API serialization.

**Time to replicate:** Any single-app competitor can replicate the workflow with integrations in 3–6 months. The structural advantage — that the draft is generated from the same ontology context as the strategy — cannot be replicated by integration; it requires architectural parity.

**Dependency chain:** Requires HeyReach (or equivalent) integration to be production-stable. Requires sender intelligence to be robust enough that the routing layer adds value rather than risk. Currently partially implemented (HeyReach referenced in product design but not yet in codebase — this is a dependency that must close before this differentiator is fully realized).

---

### Differentiator 6 — Multi-Model, Multi-Phase Strategy Generation

**What it is:** Ridge's strategy generation is not a single LLM prompt that outputs a structured document. It is a two-phase process: Phase A constructs a research and targeting brief (market context, ICP definition, buying committee structure, competitive positioning); Phase B uses the Phase A output as enriched context to generate execution materials (messaging theses, signal watch lists, sequence frameworks, objection handling). The two phases can use different models optimized for different tasks. The merged output produces a structured 11-section strategic artifact that is stored as a typed object in the ontology, not as a free-text document.

**Why it's defensible:** The two-phase architecture produces materially better output than single-pass generation because Phase B has access to research output that a single prompt cannot generate and consume simultaneously. Storing the output as a typed ontology object (rather than a document) makes it machine-readable for downstream applications — the intelligence feed can query the strategy's watch list, the draft generator can reference the messaging thesis, the Loop module can track the thesis's conversion history. No other competitor structures strategy generation this way.

**Time to replicate:** The two-phase call is straightforward to implement. The structural value comes from the typed ontology output — replicating that requires the shared semantic layer (see Differentiator 1). Partial replication (two-phase generation without ontology integration) is achievable in 2–3 months by any well-resourced AI team; full replication requires architectural parity.

**Dependency chain:** Requires ontology schema to support typed strategy objects with queryable sections. Requires consistent prompt engineering governance to maintain 11-section output fidelity across model updates. Degrades if underlying models are updated without regression testing on section quality.

---

## F.3 Patent Invention Disclosures

*Each disclosure is written to provide a patent attorney with sufficient technical specificity to draft claims. Filing priority reflects defensibility value relative to Ridge's current state of development.*

---

### Disclosure 1

**Title:** System and Method for Ontology-Driven Sales Strategy Generation Using Multi-Phase, Multi-Model AI Architecture

**Abstract:**
A computer-implemented system generates multi-section sales strategy artifacts by executing a two-phase large language model pipeline in which a first phase constructs a research and targeting context object from workspace-scoped ontological data, and a second phase consumes the first-phase output as structured input to generate execution-layer strategy sections. All outputs are persisted as typed, queryable objects in a shared semantic layer accessible to all downstream applications within the platform suite.

**Background:**
Prior art in AI-assisted sales strategy generation produces free-text documents via single-pass language model prompts provided with basic company descriptions. These documents are static artifacts — they cannot be queried by downstream applications, do not update as new signals arrive, and cannot contribute to cross-account learning. Existing sales intelligence platforms (ZoomInfo Copilot, Apollo AI, Salesmotion Research Agent) generate account summaries or brief templates via single-pass inference. None employ a multi-phase pipeline in which the output of one inference call is structured and stored as a typed context object before being consumed by a second inference call. None persist strategy output as machine-readable ontology objects.

**Invention:**
Ridge's system differs from prior art in four specific respects:

1. **Two-phase inference pipeline with structured inter-phase handoff:** Phase A (Research & Targeting) executes an LLM inference call consuming a workspace context object comprising: company website scan output, meeting notes embeddings, ICP definition fields, and target account identifiers. Phase A output is serialized as a structured JSON object with typed fields including `market_context`, `icp_definition`, `buyer_persona_array`, `competitive_landscape`, and `targeting_rationale`. This object, not a free-text string, is passed as the context payload for Phase B.

2. **Phase B (Execution) inference conditioned on structured Phase A output:** Phase B consumes the Phase A JSON object as a typed schema, not as a string concatenation. This ensures that Phase B generation is conditioned on the semantic structure of Phase A output, enabling the model to reference specific fields (e.g., `icp_definition.pain_points`) rather than parsing free text.

3. **Eleven-section typed output schema persisted to ontology:** Phase B produces a structured output object comprising eleven typed sections including `messaging_theses` (array of thesis objects with `thesis_statement`, `signal_indicators`, and `validation_status` fields), `sequence_framework`, `objection_handling`, and `watch_list` (array of signal type objects used by the intelligence feed). This object is stored in the Ridge Ontology as a first-class typed entity with a unique strategy ID, workspace foreign key, and version history.

4. **Cross-application ontology consumption:** The persisted strategy object is directly queryable by the intelligence feed module (to construct workspace-specific search queries), the draft generation module (to anchor message content to `messaging_theses`), and the thesis validation module (to track `thesis.validation_status` over time). No data transformation or API serialization occurs between modules.

**Claims:**
1. A computer-implemented method for AI-assisted sales strategy generation, comprising: receiving a workspace context object from a shared semantic data layer, the workspace context object comprising typed fields representing an organization's customer profile, target accounts, and competitive positioning; executing a first large language model inference call conditioned on the workspace context object to produce a structured research output object having a predefined schema; executing a second large language model inference call conditioned on the structured research output object to produce a multi-section strategy artifact having a predefined typed schema; and persisting the strategy artifact to the shared semantic data layer as a queryable first-class entity.

2. The method of claim 1, wherein the first large language model inference call and the second large language model inference call are executed using different model configurations optimized for research synthesis and execution planning, respectively.

3. The method of claim 1, wherein the strategy artifact comprises a plurality of typed section objects including at least a messaging thesis array and a signal watch list array, each element of which is independently accessible by other applications sharing the semantic data layer without data transformation.

4. The method of claim 1, further comprising: receiving, by an intelligence feed module, the signal watch list array directly from the shared semantic data layer without API serialization; and constructing web search queries from the signal watch list array to retrieve external signals relevant to the workspace's target accounts.

5. A system for ontology-driven sales strategy generation, comprising: a shared semantic data layer storing typed objects representing accounts, strategies, signals, and outcomes; a first inference module configured to generate a research context object from workspace-scoped ontology data; a second inference module configured to generate a typed strategy artifact conditioned on the research context object; and a plurality of application modules each configured to consume strategy artifact fields from the shared semantic data layer without intermediary data transformation.

**Dependencies:** Ridge Ontology schema (account, strategy, persona, signal, and outcome entity types); two-phase strategy generation serverless function; workspace context assembly logic from intake form and account management module.

**Filing Priority:** 1 (Highest) — This is Ridge's foundational architectural claim. All other differentiators depend on the ontology layer described here.

---

### Disclosure 2

**Title:** System and Method for Real-Time Sales Signal Detection and Workspace-Contextualized Relevance Scoring

**Abstract:**
A computer-implemented system detects and scores external signals relevant to specific commercial prospects by constructing workspace-scoped search queries derived from structured strategy artifacts stored in a shared semantic layer, executing multi-source web retrieval, deduplicating signals using content-fingerprinting, and scoring each signal's relevance against workspace-specific ideal customer profile and active messaging thesis parameters. Scoring is performed at workspace scope, not as a post-retrieval global filter.

**Background:**
Prior art in sales signal monitoring (Salesmotion, ZoomInfo intent signals, Demandbase intent data, 6sense predictive signals) generates signals at a platform level and provides user-configurable keyword filters or alert preferences to narrow relevance. Signal scoring, where it exists, uses platform-wide scoring models that do not incorporate workspace-specific strategic context. No prior art constructs search queries from structured strategy output objects at the time of retrieval. Signals in prior art systems are presented as alerts or dashboards; they do not feed back into structured strategy objects as typed, queryable signal instances.

**Invention:**
Ridge's intelligence feed module differs from prior art in the following specific respects:

1. **Query construction from typed strategy objects:** The intelligence feed reads the `watch_list` array from a workspace's active strategy artifact in the shared semantic data layer. Each `watch_list` entry is a typed object with fields including `signal_type` (e.g., "leadership_change," "funding_event," "product_launch"), `target_entities` (array of company identifiers), and `relevance_rationale` (string). The intelligence feed constructs parameterized web search queries from these typed fields, not from free-text keywords entered by a user.

2. **Multi-source retrieval with content-fingerprint deduplication:** Retrieved signals are deduplicated using a content fingerprinting algorithm that generates a hash from signal source domain, entity mentions, and event classification. Signals with identical or near-identical hashes (cosine similarity > threshold) are collapsed into a single signal instance, preserving the highest-authority source reference.

3. **Workspace-contextualized relevance scoring:** Each signal instance is scored against a composite relevance vector derived from: (a) the workspace's `icp_definition` object fields, (b) the active strategy's `messaging_theses` array, and (c) historical signal-to-outcome conversion weights from the workspace's Loop data. The resulting relevance score is a workspace-specific scalar, not a platform-wide ranking.

4. **Signal persistence as typed ontology objects:** Each signal instance passing a minimum relevance threshold is persisted to the shared semantic data layer as a typed signal object with fields including `signal_id`, `source_url`, `entity_ref` (foreign key to account), `signal_type`, `relevance_score`, `originating_strategy_id`, and `outcome_ref` (null until an activation event is logged). This enables downstream thesis validation to join signal records to outcome records.

**Claims:**
1. A computer-implemented method for workspace-contextualized sales signal detection, comprising: reading a watch list object from a shared semantic data layer, the watch list object having been generated as a typed output section of a prior AI strategy generation process; constructing a plurality of parameterized search queries from typed fields of the watch list object; executing the search queries against one or more external web sources; deduplicating retrieved signal candidates using content fingerprinting; scoring each unique signal candidate against a workspace-specific relevance vector derived from typed objects in the shared semantic data layer; and persisting signals exceeding a relevance threshold as typed signal objects in the shared semantic data layer.

2. The method of claim 1, wherein scoring each unique signal candidate comprises computing a weighted composite score using ideal customer profile field values, active messaging thesis parameters, and historical signal-to-outcome conversion weights specific to the workspace.

3. The method of claim 1, wherein each persisted signal object includes a foreign key reference to the originating strategy object and a null-valued outcome reference field that is populated upon a subsequent activation event, enabling retrospective thesis validation.

4. The method of claim 1, wherein constructing parameterized search queries comprises extracting entity identifiers, signal type classifications, and relevance rationale fields from the watch list object and composing distinct query strings for each signal type and entity combination.

5. A system for workspace-contextualized sales signal detection, comprising: a query construction module configured to build parameterized search queries from typed strategy watch list objects stored in a shared semantic data layer; a multi-source retrieval module configured to execute queries and return raw signal candidates; a deduplication module configured to eliminate redundant signals using content fingerprinting; a relevance scoring module configured to score signals against workspace-specific context vectors; and a persistence module configured to write scored signals as typed objects to the shared semantic data layer with relational references to originating strategies and accounts.

**Dependencies:** Ridge Ontology (strategy, signal, account entity types); intelligence feed serverless function; web search API integration; workspace ICP and strategy objects must be populated.

**Filing Priority:** 1 (Highest) — Core intelligence function. Directly differentiates Ridge from all signal-monitoring competitors.

---

### Disclosure 3

**Title:** System and Method for Closed-Loop Thesis Validation in B2B Sales Intelligence Platforms

**Abstract:**
A computer-implemented system tracks causal chains from strategic thesis origination through signal detection, message activation, and commercial outcome, computing thesis validation scores based on actual conversion data. Theses that fail to convert are automatically flagged for invalidation; theses that convert above threshold are promoted for application to similar accounts. Validation operates at the individual thesis level, not at the campaign or account level.

**Background:**
Prior art in sales engagement platforms tracks activity metrics (sent, opened, replied, booked) at the sequence or campaign level. Prior art in revenue intelligence (Gong, Clari) tracks deal health and forecast accuracy at the opportunity level. No prior art tracks whether the strategic premise underlying an outreach — the thesis — was validated or invalidated by commercial outcomes. ZoomInfo Copilot, 6sense, and Demandbase surface intent signals and buying group data, but do not maintain persistent thesis objects with validation state. The concept of a thesis as a trackable, validatable entity with an explicit lifecycle is not present in prior art.

**Invention:**
Ridge's Loop module implements thesis validation in the following specific ways:

1. **Thesis as a persistent typed entity with lifecycle state:** Each `thesis` object in the Ridge Ontology has fields: `thesis_id`, `thesis_statement`, `originating_strategy_id`, `signal_indicators` (array of signal types expected to validate the thesis), `validation_status` (enum: PROVISIONAL | ACTIVE | VALIDATED | INVALIDATED | SUPERSEDED), `validation_score` (float 0.0–1.0), and `conversion_events` (array of outcome references). Thesis state transitions are logged with timestamps and triggering event references.

2. **Signal-to-thesis attribution:** When a signal object is persisted (see Disclosure 2), the system evaluates whether the signal's `signal_type` matches any `signal_indicators` field of active theses in the same workspace. If a match is found, the signal object is linked to the thesis via a many-to-many join table. This creates an auditable signal-support chain for each thesis.

3. **Activation-to-thesis attribution:** When an outreach draft is generated from a signal object, the draft object is tagged with the signal's `originating_strategy_id` and, where determinable, the specific thesis that informed the draft's messaging. When the draft is activated (sent), an activation event object is created with thesis foreign key.

4. **Outcome-based validation scoring:** When an outcome event (reply, meeting booked, deal created, deal closed) is logged or integrated from a CRM, the system traverses the activation → signal → thesis attribution chain and increments the thesis's `validation_score` using a configurable weighted function. Positive outcomes above a threshold transition the thesis from PROVISIONAL to VALIDATED; extended periods without positive outcomes transition the thesis to INVALIDATED.

5. **Cross-thesis promotion:** VALIDATED theses are flagged for consideration by the Atlas module (Disclosure 4) for promotion to vertical-level pattern libraries, subject to privacy-preserving aggregation.

**Claims:**
1. A computer-implemented method for thesis validation in a B2B sales intelligence platform, comprising: maintaining a thesis object in a shared semantic data layer, the thesis object comprising a thesis statement, a set of expected signal indicator types, a validation status, and a validation score; associating detected signal objects with the thesis object when signal type matches expected signal indicator types; associating activation events with the thesis object when an outreach message derived from an associated signal is transmitted; receiving an outcome event indicating a commercial result of the activation; and updating the thesis object's validation score and validation status based on the outcome event.

2. The method of claim 1, wherein updating the thesis object's validation score comprises traversing an attribution chain from the outcome event to its associated activation event, from the activation event to its associated signal object, and from the signal object to the thesis object, and applying a weighted scoring function that accounts for time-to-outcome and outcome type.

3. The method of claim 1, further comprising: upon the thesis object's validation status transitioning to INVALIDATED based on sustained absence of positive outcome events, generating a thesis revision recommendation comprising alternative signal indicator types derived from VALIDATED theses in the same workspace or vertical.

4. The method of claim 1, further comprising: upon the thesis object's validation status transitioning to VALIDATED, transmitting an anonymized pattern record to a cross-workspace learning module for aggregation with thesis pattern records from other workspaces in the same vertical.

5. A system for closed-loop thesis validation in a B2B sales intelligence platform, comprising: a thesis registry storing typed thesis objects with mutable validation state; a signal attribution module configured to link signal objects to thesis objects by signal type matching; an activation attribution module configured to link outreach events to thesis objects via signal references; an outcome integration module configured to receive commercial outcome events from external CRM systems or internal logging; and a validation scoring engine configured to update thesis validation scores and status based on attributed outcome chains.

**Dependencies:** Ridge Ontology (thesis, signal, activation, outcome entity types); Loop module; CRM integration or internal outcome logging; Atlas module for downstream promotion.

**Filing Priority:** 2 — High defensibility; the thesis lifecycle concept is novel across all identified prior art.

---

### Disclosure 4

**Title:** System and Method for Cross-Workspace Vertical Intelligence Aggregation with Cryptographic Data Isolation

**Abstract:**
A computer-implemented system aggregates pattern-level sales intelligence learnings across multiple client workspaces sharing a vertical classification, without exposing workspace-specific account, contact, or message data to any other workspace. Pattern records are derived from anonymized thesis validation signals, stored as hashed pattern objects, and consumed by strategy generation and intelligence scoring modules to improve output quality for workspaces in the same vertical.

**Background:**
Prior art in B2B intelligence platforms does not aggregate cross-customer learning in a privacy-preserving manner. Platforms with large user bases (ZoomInfo, Apollo) use aggregate engagement data to improve platform-level models but do not surface vertical-specific pattern intelligence to individual customers. Product-led sales platforms (Pocus) use individual workspace's product usage data but do not aggregate across workspaces. No prior art maintains a cryptographically isolated vertical pattern library that individual workspaces can contribute to and benefit from without data exposure.

**Invention:**
Ridge's Atlas module implements cross-workspace learning as follows:

1. **Vertical classification of workspaces:** Each workspace is assigned one or more vertical tags at onboarding (e.g., `vertical_id: "mid-market-healthcare-IT"`). The vertical taxonomy is maintained in the Ridge Ontology as a hierarchical classification tree.

2. **Pattern record generation from validated theses:** When a thesis object in workspace W transitions to VALIDATED status, Atlas generates a pattern record comprising: a one-way hash of the thesis statement (SHA-256 of normalized text, preventing reconstruction), the thesis's `signal_indicators` array (not workspace-specific), the validation score, and the vertical tag of workspace W. No account identifiers, contact data, company names, or message content are included in the pattern record.

3. **Vertical pattern library aggregation:** Pattern records are aggregated by vertical tag into a vertical pattern library. The library records, for each signal type combination, the aggregate validation rate across all contributing workspaces in the vertical. The library does not retain references to originating workspace IDs or thesis IDs.

4. **Consumption by strategy and intelligence modules:** During strategy generation for a new workspace in a given vertical, the system queries the vertical pattern library for high-validation signal type patterns and incorporates them as weighted priors in the `watch_list` generation phase. During intelligence feed scoring, pattern library validation rates are used as a component of the relevance scoring vector.

5. **Workspace access controls:** Each workspace can only read from the vertical pattern library (not from other workspaces' raw data). Write access to the pattern library is mediated exclusively by the Atlas aggregation service, which enforces the one-way hash transformation. Access logs are maintained for audit purposes.

**Claims:**
1. A computer-implemented method for cross-workspace sales intelligence aggregation, comprising: receiving a validated thesis pattern record from a first workspace, the pattern record comprising a one-way hash of the thesis statement, an array of signal indicator types, a validation score, and a vertical identifier, and excluding workspace-identifying information, account identifiers, and contact data; aggregating the pattern record with pattern records from other workspaces sharing the vertical identifier into a vertical pattern library; and incorporating vertical pattern library data into strategy generation and signal relevance scoring operations for workspaces having the same vertical identifier.

2. The method of claim 1, wherein generating the pattern record comprises applying a one-way cryptographic hash function to a normalized representation of the thesis statement, such that the original thesis statement cannot be reconstructed from the pattern record.

3. The method of claim 1, wherein incorporating vertical pattern library data into strategy generation comprises weighting signal watch list entries based on aggregate validation rates for corresponding signal type combinations in the vertical pattern library.

4. The method of claim 1, further comprising: enforcing, via access controls, that each workspace may read only aggregated vertical pattern library data and may not access pattern records, raw data, or derived data of any other individual workspace.

5. A system for privacy-preserving cross-workspace vertical intelligence aggregation, comprising: a pattern record generator configured to produce anonymized, hashed pattern records from validated thesis objects without including workspace-specific identifiers or content; a vertical pattern library data store organized by vertical classification; an aggregation service configured to accumulate pattern records and compute aggregate validation statistics per signal type combination per vertical; and a consumption interface providing read-only access to aggregated vertical statistics for authorized workspace applications.

**Dependencies:** Ridge Ontology (workspace, vertical, thesis, pattern entity types); Atlas aggregation service; Loop module (source of VALIDATED thesis events); workspace access control system.

**Filing Priority:** 2 — Network effect protection; becomes more valuable as client base grows.

---

### Disclosure 5

**Title:** System and Method for AI-Generated Buying Committee Inference from Heterogeneous Organizational Signals

**Abstract:**
A computer-implemented system infers the probable decision-making structure of a prospect organization's buying committee by synthesizing job title taxonomies, hiring pattern data, organizational hierarchy signals, LinkedIn profile data, and account news signals through a multi-source inference model. The inferred committee is persisted as a typed graph object in a shared semantic layer, enabling downstream personalization of messaging to specific inferred roles without manual research.

**Background:**
Prior art buying committee identification tools (Demandbase buying groups, 6sense buying group analytics, ZoomInfo Copilot buying group identification, Salesloft Auto Buying Group Capture) rely on known contact records — they identify buying committee members from existing CRM contacts or from the platform's contact database. They do not infer probable committee structure for accounts where contact data is incomplete or absent. Salesloft's Auto Buying Group Capture automatically captures individuals who appear in emails or meeting invites, but does not infer the committee from organizational signals when no prior contact exists. No prior art infers buying committee structure from job posting patterns, organizational hierarchy signals, and news events as a probabilistic model.

**Invention:**
Ridge's Committee Map module implements buying committee inference as follows:

1. **Multi-signal input schema:** The inference model receives, for a target account, a composite input object comprising: (a) confirmed contact records with job titles, (b) LinkedIn job posting data (open roles indicating organizational growth or priority areas), (c) recent news signals tagged as `signal_type: "leadership_change"` or `signal_type: "org_restructure"`, (d) technographic data indicating active vendors (inferring functional ownership), and (e) the workspace's `buyer_persona_array` from the active strategy artifact.

2. **Role-probability inference:** The model maps input signals to a set of probable buying committee roles (Economic Buyer, Technical Evaluator, Champion, Blocker, Legal/Procurement) with associated probability scores. Job title patterns are matched against a curated role taxonomy. Hiring signals are used as positive evidence for roles not yet filled in the contact database. Leadership change signals are used to flag committee volatility.

3. **Committee graph persistence:** The inferred committee is persisted as a directed graph object in the Ridge Ontology, with nodes representing inferred roles (with probability scores and, where available, specific person references) and edges representing influence relationships (e.g., Technical Evaluator reports to Economic Buyer). The graph is queryable by role type, probability threshold, and account.

4. **Downstream messaging personalization:** The draft generation module reads the committee graph when generating outreach for a given account and anchors message content to the specific inferred role being addressed. A message to a probable Technical Evaluator incorporates different thesis framing than a message to the probable Economic Buyer, using role-specific fields from the strategy's `buyer_persona_array`.

**Claims:**
1. A computer-implemented method for buying committee inference, comprising: receiving a multi-source organizational signal object for a target account, the object comprising job title data, hiring pattern data, organizational news signals, and technographic indicators; executing an inference model that maps signal data to a set of probable buying committee roles with associated probability scores; persisting an inferred buying committee as a typed graph object in a shared semantic data layer, with nodes representing inferred roles and edges representing inferred influence relationships; and providing the committee graph object to a message generation module for role-specific outreach personalization.

2. The method of claim 1, wherein mapping signal data to probable buying committee roles comprises matching job title strings against a curated role taxonomy and applying probability adjustments based on open job posting patterns indicating unfilled roles.

3. The method of claim 1, wherein the typed graph object comprises, for each node, a role type classification, a probability score, an optional reference to a specific person record, and a signal provenance array identifying which input signals contributed to the role inference.

4. The method of claim 1, further comprising: updating node probability scores when new organizational signals are detected for the target account, and generating a committee volatility indicator when leadership change signals are associated with high-probability nodes.

5. The method of claim 1, wherein providing the committee graph object to a message generation module comprises selecting, for a given outreach draft, the target role node with the highest probability score above a minimum threshold and injecting role-specific persona attributes from a workspace strategy artifact into the draft generation prompt.

**Dependencies:** Ridge Ontology (account, committee, role, person entity types); strategy artifact buyer persona array; intelligence feed signal objects; draft generation module.

**Filing Priority:** 3 — Valuable but more replicable; competitors with large contact databases have partial solutions.

---

### Disclosure 6

**Title:** System and Method for Dynamic Sender Pool Optimization Based on Deliverability Intelligence and Recipient Domain Classification

**Abstract:**
A computer-implemented system manages a pool of sender accounts for commercial outreach, continuously monitors per-sender deliverability metrics (inbox placement rate, domain reputation, bounce rate, spam classification frequency), classifies recipient domains by expected deliverability environment, and dynamically routes outgoing messages to the sender-recipient pairing most likely to achieve inbox placement, without human intervention. Routing decisions are recorded as typed objects enabling retrospective analysis and model refinement.

**Background:**
Email deliverability management in prior art is addressed at the domain level (domain warming tools, DNS configuration checkers) or at the individual sender level (sequence tools that monitor bounce rates per sender). No prior art implements dynamic, real-time routing of individual messages across a pool of 40+ sender accounts based on a composite deliverability model incorporating both sender-side health metrics and recipient-side domain classification. Existing multi-sender tools (Instantly, Smartlead) allow users to distribute sending volume across accounts but do not make per-message routing decisions based on real-time deliverability intelligence.

**Invention:**
Ridge's Sender Intelligence module implements dynamic sender pool optimization as follows:

1. **Per-sender health scoring:** For each sender account in the pool, the system maintains a health object with fields including: `inbox_placement_rate` (7-day rolling average), `domain_reputation_score` (from third-party reputation APIs), `bounce_rate` (7-day rolling), `spam_classification_rate` (estimated from bounce codes and engagement rates), `warmup_phase` (boolean), and `volume_budget` (messages per day remaining). Health scores are updated on a configurable interval (minimum: per-send-batch; default: hourly).

2. **Recipient domain classification:** Before routing, the recipient's email domain is classified against a domain profile that includes: expected ESP (mail server fingerprinting), historical deliverability outcomes for the sender pool to that domain, and corporate email security posture indicators (presence of DMARC/DKIM enforcement, known filtering vendors). Domain classifications are cached with a time-to-live and refreshed on cache miss or significant classification change.

3. **Routing decision function:** For each outgoing message, the system computes a sender-recipient compatibility score for each healthy sender in the pool, based on: (a) sender health score, (b) historical inbox placement rate for the sender-to-domain combination, (c) volume budget available on the sender, and (d) warm-up phase restrictions. The message is routed to the sender with the highest compatibility score above a minimum threshold. If no sender meets the threshold, the message is queued for the next routing cycle.

4. **Routing event persistence:** Each routing decision is persisted as a typed routing event object in the Ridge Ontology, with references to the sender account, recipient domain, message object, compatibility scores, and eventual deliverability outcome (when known). These records are used to refine the routing model over time.

5. **Pool-level volume normalization:** The system distributes total send volume across the sender pool to prevent volume concentration on high-scoring senders that would accelerate reputation degradation. Volume normalization uses a configurable distribution function that weights sender health scores against a maximum-concentration ceiling.

**Claims:**
1. A computer-implemented method for dynamic sender pool optimization in multi-sender commercial messaging, comprising: maintaining a health record for each sender account in a sender pool, the health record comprising inbox placement rate, domain reputation score, bounce rate, spam classification rate, and volume budget; classifying each recipient's email domain into a domain profile comprising expected mail server type, historical deliverability outcomes, and security posture indicators; computing, for each outgoing message, a sender-recipient compatibility score for each sender in the pool using sender health metrics, historical sender-to-domain placement rates, and available volume budget; routing the message to the sender with the highest compatibility score above a minimum threshold; and persisting a routing event record linking the routing decision to its eventual deliverability outcome.

2. The method of claim 1, further comprising: normalizing send volume distribution across the sender pool using a volume allocation function that prevents concentration of volume on high-scoring senders above a configurable ceiling, to protect long-term sender health across the pool.

3. The method of claim 1, wherein computing the sender-recipient compatibility score further comprises applying a warm-up phase restriction that limits compatibility scores for sender accounts in a warm-up phase to recipients in lower-security-posture domain classifications.

4. The method of claim 1, further comprising: detecting, based on accumulated routing event records, sender-to-domain combinations with consistently below-threshold inbox placement rates; generating a pool recommendation that flags the sender for rotation out of routing consideration for that domain classification; and surfacing the recommendation to an administrative interface.

5. A system for sender pool optimization in multi-sender commercial messaging, comprising: a sender health monitoring module configured to continuously update per-sender deliverability metrics; a recipient domain classification module configured to profile recipient mail environments; a routing engine configured to compute sender-recipient compatibility scores and make per-message routing decisions; a volume normalization module configured to distribute send volume across the pool within configurable bounds; and a routing event data store recording all routing decisions and their associated deliverability outcomes for model refinement.

**Dependencies:** HeyReach API integration (or equivalent multi-sender infrastructure); Ridge Ontology (sender, routing event, message entity types); third-party domain reputation API; deliverability outcome webhook or polling integration.

**Filing Priority:** 2 — Technically specific; no direct prior art identified for the per-message dynamic routing mechanism across a 40+ sender pool.

---

# SECTION G — RISKS, OPEN QUESTIONS, AND KILL CRITERIA

## G.1 Technical Risks

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| T-1 | **Vercel cold-start and execution limits under concurrent load.** Ridge's strategy generation makes two large LLM calls with combined latency of 30–90 seconds, inside a single serverless function. Vercel's default function timeout is 10 seconds (Hobby) and 300 seconds (Pro/Enterprise). Concurrent users triggering multiple strategy generations will exhaust execution concurrency limits and produce timeout failures. | High | High | Migrate strategy generation to a dedicated background job queue (e.g., Inngest, Trigger.dev, or AWS Lambda with extended timeout). Decouple frontend polling from synchronous function response. Implement progress streaming so users receive feedback during long-running calls. This migration is required before any growth beyond single-digit concurrent users. |
| T-2 | **AI API cost at scale.** Each 11-section strategy generation call currently consumes approximately 20,000–60,000 tokens (Phase A + Phase B combined), plus intelligence feed queries across multiple accounts. At current OpenAI pricing (~$0.015/1K output tokens for GPT-4o), a client with 50 accounts running weekly strategy refreshes costs Ridge approximately $300–$900/month in API costs before any margin. At scale (20 clients × 50 accounts), API costs reach $6K–$18K/month. | Medium | High | (a) Implement model routing: use cheaper models for lower-complexity tasks (signal scoring, deduplication, brief summarization) and reserve premium models for strategy generation. (b) Cache strategy artifacts with explicit invalidation triggers rather than re-generating on every load. (c) Build token usage telemetry per workspace per month before pricing is finalized, so pricing model reflects actual cost structure. |
| T-3 | **HeyReach API dependency and vendor lock-in.** The sender intelligence and activation pipeline is designed around HeyReach's API for LinkedIn message sequencing across 40+ senders. HeyReach's API terms, rate limits, and feature roadmap are outside Ridge's control. LinkedIn has actively cracked down on automation tools — HeyReach's API access could be revoked, restricted, or priced prohibitively on short notice. The HeyReach integration is referenced in product design but is not yet in the codebase, meaning this risk has not yet been stress-tested. | High | Critical | (a) Design the sender intelligence module against an abstraction layer (e.g., `SenderProvider` interface) so that HeyReach can be replaced without architectural changes. (b) Identify at least one alternative provider (Instantly, Smartlead, or self-hosted Waalaxy) as a fallback. (c) Do not expose HeyReach-specific features in user-facing nomenclature. (d) Pursue direct LinkedIn partnership discussions as Ridge scales — authorized access eliminates the dependency. |
| T-4 | **Data migration complexity as schema evolves.** Ridge's ontology schema will change significantly during v3 development as new entity types (thesis, signal, routing event, committee) are added. Neon Postgres does not provide schema migration versioning or automated rollback. An unmanaged migration on a live database with client data could corrupt existing strategy artifacts, account records, or intelligence histories. | Medium | High | Adopt a formal migration framework (Drizzle ORM or Prisma Migrate) before onboarding any paying clients. Enforce backward-compatible schema changes (additive-only during active feature development). Create automated migration test suites that run against a production-mirror database before any deployment. Implement point-in-time recovery on Neon (available on paid tiers). |
| T-5 | **Single-developer bus factor.** Ridge's entire codebase is currently maintained by one developer. If that developer is unavailable for an extended period due to health, departure, or competing priorities, product development stops and client-facing bugs go unresolved. This is not a hypothetical risk — it is the current operational reality. | High | Critical | (a) Maintain an architecture decision record (ADR) document and code annotation standards that would allow a competent React/serverless developer to orient quickly. (b) Engage at least one part-time technical contractor who has access to the codebase and can handle emergency patches. (c) Define a "bus factor plan" that identifies which features can be frozen, which clients would need to be notified, and what the escalation path looks like — before it is needed. |
| T-6 | **Neon Postgres connection pool exhaustion.** Neon's serverless Postgres uses connection pooling via PgBouncer. Each serverless function invocation can open a new connection. Under concurrent load (multiple users triggering intelligence feed refreshes simultaneously), the connection pool can exhaust, causing query failures. Neon's free tier has a hard connection limit of 20. | Medium | High | Upgrade to Neon's paid tier with higher connection limits. Implement connection pooling at the application layer using a connection pool manager rather than opening direct connections per function invocation. Monitor connection usage in production logging before this becomes a production incident. |
| T-7 | **LLM output schema drift.** Ridge's strategy generation, intelligence scoring, and draft generation depend on LLM outputs conforming to defined JSON schemas (typed strategy artifacts, signal objects). LLM providers update models without notice, and model updates can change output formatting behavior in ways that break schema validation. A schema drift event on the strategy generation function would corrupt stored strategy artifacts for all workspaces. | Medium | High | Implement strict output schema validation with retries and fallback model routing. Pin model versions where the API allows it. Maintain a regression test suite of 20–30 representative strategy generation inputs with expected schema outputs, run on every deployment. Log all schema validation failures with the raw model output for diagnostic review. |

---

## G.2 Business Risks

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| B-1 | **Marketing/product gap (Critical).** Ridge has no dedicated marketing function and no documented go-to-market motion. The product's architectural differentiation (ontology-native suite) is not communicated through any public-facing materials. Sophisticated buyers who would value the architectural approach cannot discover Ridge. Ridge risks being perceived as "another AI sales tool" and competing on price rather than architecture. This is the most critical near-term business risk. | High | Critical | Develop a category narrative ("sales intelligence suite" vs. "point solution with integrations") before the next client acquisition effort. Create one detailed competitive positioning document that explains the ontology architecture in language a VP of Sales can understand without a technical degree. Identify 2–3 referenceable clients willing to describe the architectural advantage in their own words for case studies. |
| B-2 | **Competitor response: ZoomInfo, Apollo, or 6sense acquires or builds similar.** Ridge's architectural thesis is publicly articulable once documented. A well-funded competitor (ZoomInfo's market cap exceeds $10B; 6sense raised $200M+) could initiate a greenfield rebuild of a shared semantic layer or acquire an ontology-adjacent company and reframe their product accordingly. | Low (12-month window) / Medium (24-month window) | High | Speed of client acquisition is the primary defense. The pattern library (Atlas) moat is proportional to Ridge's client base — the faster Ridge gets to 20–30 clients in a vertical, the harder the pattern library is to replicate. File patent applications on the core disclosures above before the architectural thesis is publicly articulated in marketing materials. |
| B-3 | **Pricing model not validated.** Ridge has no validated data on what clients will actually pay, what the right unit of pricing is (per seat, per account, per strategy, platform fee), or where the pricing inflection between managed-service and self-serve lies. Premature pricing commitments may either undercut margin or price out early adopters needed to build the Atlas pattern library. | High | High | Run a structured pricing experiment with the next 5 clients: offer two pricing structures (e.g., per-account vs. flat platform fee) and observe negotiation dynamics. Instrument cost-per-workspace to know the floor before setting the price. Consult comparable managed-service pricing: Salesmotion's $990/mo unlimited-user team plan and Draup's $75K/yr enterprise contract represent the relevant range. |
| B-4 | **Client concentration risk.** If Ridge's revenue is concentrated in 1–3 clients, the loss of any single client is an existential event. Managed-service models in early stages often concentrate in a small number of high-touch relationships. | High (current state) | Critical | Set a client concentration ceiling: no single client should represent more than 30% of revenue by the end of Y1. This is a structural discipline, not an organic outcome — it requires actively acquiring new clients before existing clients grow to dangerous concentration. |
| B-5 | **LinkedIn Terms of Service and automation enforcement.** Ridge's activation pipeline depends on LinkedIn data (profile data, hiring signals, org chart inference) and LinkedIn-based message sequencing via HeyReach. LinkedIn's ToS prohibits automated scraping of profile data and unsanctioned bulk messaging. LinkedIn has litigated against scraping vendors (hiQ Labs v. LinkedIn) and actively blocks automation tools. A LinkedIn enforcement action could eliminate Ridge's LinkedIn data sourcing and activation simultaneously. | Medium | Critical | (a) Ensure all LinkedIn data sourcing uses officially licensed APIs or licensed data vendors — never direct scraping. (b) Ensure HeyReach's LinkedIn integration uses approved LinkedIn automation methods — verify HeyReach's compliance posture contractually. (c) Develop a non-LinkedIn signal sourcing pathway (company news, job boards, SEC filings, company websites) that can substitute for LinkedIn signals if LinkedIn access is restricted. (d) Do not put "LinkedIn" in user-facing feature names in ways that imply endorsement. |
| B-6 | **GDPR and CAN-SPAM compliance at scale.** Ridge's outreach pipeline routes messages to European contacts (GDPR Article 6 lawful basis requirements for cold outreach) and US contacts (CAN-SPAM compliance). At managed-service scale, compliance is a client responsibility, but Ridge's platform facilitates the non-compliant activity and could be named in regulatory actions. | Medium | High | (a) Include clear contractual language allocating compliance responsibility to the client workspace (Ridge is a tool, not a sender of record). (b) Build basic compliance guardrails into the platform: unsubscribe handling, suppression list management, and opt-out honoring. (c) Obtain legal review of the outreach pipeline by a counsel specializing in CAN-SPAM and GDPR Article 6(1)(f) (legitimate interests basis for B2B cold outreach). (d) Implement geographic send restrictions as a workspace-level configuration option. |
| B-7 | **Talent concentration: managed service margin economics.** A managed-service model where Ridge writes strategies, monitors intelligence feeds, and manages activation for clients creates a personnel cost structure that limits margin and scalability. If each client requires 5–10 hours/week of human attention, Ridge cannot scale beyond 8–10 clients per operator. This is a structural constraint, not just a workload issue. | Medium | High | Define an explicit "automation percentage" target for each workflow: strategy generation should be 90%+ automated (human review only); intelligence feed should be 95%+ automated; draft review may be 60–70% automated with human quality pass. Track actual hours per client per week against targets. Build toward a self-serve tier where clients operate the platform with minimal Ridge intervention — this is the path to scalable margin. |

---

## G.3 Open Questions

The following questions require explicit decisions before Ridge can finalize its v3 architecture, pricing, and go-to-market approach. Each is framed as a decision with consequences, not as an open research question.

**OQ-1: Should Ridge own its sender infrastructure or remain on HeyReach?**
Owning infrastructure (procuring and managing email/LinkedIn accounts directly) gives Ridge control over deliverability, removes API dependency, and makes Sender Intelligence more defensible. It also adds significant operational complexity (account procurement, warming, reputation management, compliance exposure). The decision has architectural consequences: the Sender Intelligence module is designed differently depending on whether Ridge controls the infrastructure. **Decision needed before HeyReach integration begins.**

**OQ-2: When does Ridge need its own data asset versus relying on AI-powered web search?**
Ridge currently uses web AI search for intelligence signals. This works for public signals (news, job postings, SEC filings) but does not provide access to private B2B contact databases, intent data networks, or firmographic enrichment. The decision is not binary — Ridge could license specific data products (e.g., Bombora intent data, Clearbit firmographics) for specific use cases rather than building from scratch. However, every licensed data product adds cost structure and vendor dependency. **Decision needed before the intelligence feed is productionized beyond beta.**

**OQ-3: What is the pricing inflection point between managed service and self-serve?**
Ridge's current operational model is managed service (Ridge operates the platform on behalf of clients). A self-serve tier — where clients log in and operate the platform themselves — requires a production-quality UI, onboarding, and customer success infrastructure. The question is not just when to build self-serve, but whether the managed-service margin funds that investment or whether external capital is required. **Decision needed within 90 days to inform Y1 financial model.**

**OQ-4: Should the Ridge Ontology be exposed as an API for power users?**
An Ontology API would allow clients to query their own strategic data programmatically — building custom dashboards, integrating with internal BI tools, or feeding Ridge data into their own workflows. This increases Ridge's stickiness and positions the platform as infrastructure. It also increases engineering complexity and support burden. If Ridge files patents on the ontology architecture, an open API creates public prior art for the implementation — which has both positive (establishes first-mover evidence) and negative (reveals implementation details to competitors) implications. **Decision needed before any enterprise sales conversation where CTO-level evaluation is expected.**

**OQ-5: Should thesis validation outcomes be shared with clients or remain a Ridge-internal optimization signal?**
If clients can see which of their theses have been validated and which have been invalidated (with supporting evidence), it creates a powerful retention driver — the platform demonstrates value in explicit, auditable terms. It also requires Ridge to stand behind the validation methodology, which is only as good as the volume and quality of outcome data feeding it. Premature exposure of inconclusive validation data could erode client trust. **Decision needed before Loop module goes to client-facing UI.**

**OQ-6: Which verticals does Ridge target first for the Atlas pattern library?**
Atlas's value is vertical-specific. Ridge needs to concentrate early client acquisition in 1–2 verticals to build the pattern library to minimum viable density (approximately 5–8 clients with 6+ months of outcome data per vertical). Spreading client acquisition across too many verticals dilutes Atlas's value for all of them. The choice of initial verticals should be driven by: (a) where Ridge's founding team has existing relationships, (b) where average deal sizes justify managed-service economics, and (c) where competitors have structural weaknesses. **Decision needed before the next client acquisition conversation.**

**OQ-7: What CRM does Ridge integrate with first, and is that integration bidirectional?**
A CRM integration is required for the outcome data that feeds thesis validation. Without outcome data, the Loop module cannot function. Salesforce is the enterprise standard; HubSpot is the SMB standard. A bidirectional integration (Ridge reads outcomes from CRM; Ridge writes enriched account data back to CRM) increases stickiness but requires OAuth, data mapping, and ongoing maintenance. **Decision needed before Loop module development begins.**

**OQ-8: Does Ridge build Committee Map before or after the intelligence feed is production-stable?**
Committee Map (buying committee inference) is a high-value feature for enterprise deals but requires LinkedIn data sourcing that carries ToS risk (OQ-2, B-5). Building Committee Map before the intelligence feed is production-stable may spread engineering focus at a critical moment. Alternatively, Committee Map is a compelling demo asset that could accelerate client acquisition. **Sequencing decision needed in sprint planning.**

**OQ-9: What is the data retention and deletion policy for workspace data?**
GDPR Article 17 (right to erasure) requires that Ridge be able to delete all personal data associated with a client workspace on request. Ridge's Ontology, if it stores contact-level data (names, email addresses, LinkedIn profile data), must support workspace-level deletion without cascading failure to shared data structures (e.g., Atlas pattern records derived from that workspace). This is an architectural requirement, not a policy question. **Decision needed before any EU client is onboarded.**

**OQ-10: Should Ridge patent filings be provisional or non-provisional, and in which jurisdictions?**
A provisional patent application preserves a 12-month priority date at lower cost (~$1,500–$3,000 in legal fees) but requires conversion to non-provisional within 12 months to maintain priority. Given the pace of AI development in this space, a 12-month window to observe competitor behavior before committing to full prosecution may be strategically valuable. US-only filing covers the primary market; PCT (Patent Cooperation Treaty) filing preserves international priority at higher cost. **Decision needed before any patent disclosures are made public through marketing materials or conference presentations.**

**OQ-11: When does Ridge need a formal security audit?**
Enterprise buyers at the $50K+ ARR tier will ask for SOC 2 Type II certification or equivalent. A SOC 2 audit takes 6–12 months from control implementation to certification and costs $30K–$80K in total. Ridge's current architecture (React SPA + serverless + Neon) is auditable but likely has gaps in access controls, audit logging, and data encryption that would need to close first. **Decision needed before any enterprise sales cycle that reaches security review.**

**OQ-12: What is Ridge's acquisition strategy if a large competitor makes an approach?**
Given the patent portfolio being developed and the architectural differentiation, Ridge may attract acquisition interest from a platform company seeking to add an ontology-native layer. Having a pre-defined framework for evaluating acquisition offers (minimum revenue multiple, strategic fit criteria, team retention requirements) prevents reactive decision-making under time pressure. This is a governance question as much as a business question. **Requires board-level discussion before first enterprise client is signed, not when an offer arrives.**

---

## G.4 Kill Criteria

The following conditions, if met, indicate that the v3 expansion should be paused or abandoned. Each criterion is specific, measurable, and time-bound. "Abandon" means halting new feature development and moving to maintenance mode; it does not necessarily mean shutting down existing client relationships.

**KC-1: Revenue signal failure**
If Ridge has not signed at least 3 paying client contracts at a minimum of $2,000/month each by the end of Month 9 post-v3 launch, the managed-service model has not demonstrated product-market fit at a viable price point. Stop acquiring new clients and spend 60 days doing structured win/loss interviews with all prospects who declined. If no clear correctable cause is identified, abandon the expansion plan and return to a narrower scope.

**KC-2: API cost ratio failure**
If, at any point, AI API costs (LLM inference + web search) exceed 40% of recognized revenue for three consecutive months, the current architecture is economically unviable at scale without pricing changes that the market has not validated. Trigger a mandatory cost-reduction sprint (model routing, caching, scope reduction) before any new client is onboarded.

**KC-3: Activation pipeline non-delivery**
If the HeyReach integration (or equivalent sender infrastructure) is not production-deployed and used by at least 2 clients within 6 months of v3 launch, the signal-to-draft-to-send differentiator is theoretical, not real. The strategy suite without activation is a research tool competing against Salesmotion and Draup on inferior data assets. Reassess the product scope: either resource the activation build to completion or pivot to a pure intelligence product with explicit integration handoffs.

**KC-4: Ontology integrity failure**
If Ridge experiences a data corruption event affecting client strategy artifacts or account data — due to schema migration failure, database error, or infrastructure incident — and is unable to restore full data integrity within 72 hours, and if that event results in one or more clients losing confidence in the platform's reliability, pause all new development and conduct a full infrastructure audit before resuming. A managed-service platform that loses client data has lost its operational right to exist in that client's stack.

**KC-5: Regulatory enforcement action**
If Ridge or any of its HeyReach-integrated clients receives a cease-and-desist from LinkedIn, a CAN-SPAM enforcement action from the FTC, or a formal GDPR complaint from a data protection authority relating to Ridge's platform, suspend the relevant functionality immediately. Resume only after obtaining a written legal opinion confirming a compliant path forward. If no compliant path is identified within 90 days, abandon the activation pipeline and operate as a pure intelligence platform.

**KC-6: Atlas minimum viable density not reached in lead vertical**
If, by the end of Month 18 post-v3 launch, Ridge has not accumulated at least 6 clients in a single vertical with at least 4 months of outcome data each, the Atlas module cannot produce validated pattern intelligence. Without Atlas, Ridge's cross-workspace learning claim is aspirational. Suspend Atlas development, redirect resources to client acquisition in a single focused vertical, and re-evaluate at Month 24. If the vertical concentration target is still not met, remove Atlas from the product roadmap and reframe Ridge's differentiation around the ontology architecture and closed-loop thesis validation alone.

---

*End of Sections F and G.*

*Document version: Draft 1.0. For board and patent attorney review.*
*Classification: Confidential — Ridge internal use only.*
