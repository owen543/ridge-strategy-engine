# Ridge Platform Expansion Brief

**Prepared for:** Owen, CEO/Founder, Ridge  
**Platform:** platform.joinridge.co  
**Date:** April 2026  
**Classification:** Internal — Strategic and Confidential  
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Section A: Platform Audit](#section-a-platform-audit)
   - [A.1 Architecture Overview](#a1-architecture-overview)
   - [A.2 Database Schema](#a2-database-schema)
   - [A.3 Authentication](#a3-authentication)
   - [A.4 API Surface](#a4-api-surface)
   - [A.5 Frontend Components](#a5-frontend-components)
   - [A.6 Live Platform State](#a6-live-platform-state)
   - [A.7 Known Issues and Technical Gaps](#a7-known-issues-and-technical-gaps)
3. [Section B: The Ridge Ontology](#section-b-the-ridge-ontology)
   - [B.1 Architecture Philosophy](#b1-architecture-philosophy)
   - [B.2 Object Types](#b2-object-types)
   - [B.3 Link Types](#b3-link-types)
   - [B.4 Property Type Reference](#b4-property-type-reference)
4. [Section C: The Ridge Application Suite](#section-c-the-ridge-application-suite)
5. [Section D: Actions and Functions — The Kinetic Layer](#section-d-actions-and-functions--the-kinetic-layer)
   - [D.1 Actions](#d1-actions)
   - [D.2 Functions](#d2-functions)
6. [Section E: Implementation Plan](#section-e-implementation-plan)
   - [E.1 Current Stack Assessment](#e1-current-stack-assessment)
   - [E.2 Recommended Migration Path](#e2-recommended-migration-path)
   - [E.3 90-Day Sprint Plan](#e3-90-day-sprint-plan)
7. [Section F: IP and Moat Analysis](#section-f-ip-and-moat-analysis)
   - [F.1 Competitive Landscape](#f1-competitive-landscape)
   - [F.2 Ridge's Defensible Differentiators](#f2-ridges-defensible-differentiators)
   - [F.3 Patent Invention Disclosures](#f3-patent-invention-disclosures)
8. [Section G: Risks, Open Questions, and Kill Criteria](#section-g-risks-open-questions-and-kill-criteria)
   - [G.1 Technical Risks](#g1-technical-risks)
   - [G.2 Business Risks](#g2-business-risks)
   - [G.3 Open Questions](#g3-open-questions)
   - [G.4 Kill Criteria](#g4-kill-criteria)

---

## Executive Summary

Ridge is a live, working AI sales intelligence platform operating at platform.joinridge.co. As of April 2026, it delivers a complete end-to-end workflow: structured client intake, AI-generated go-to-market strategy across eleven dimensions, and a real-time intelligence feed with 48 active signals across 16 signal types. The platform is built on a compact but functional stack — React 18 frontend, a single Node.js serverless function on Vercel, and Neon PostgreSQL — and is generating real strategy output for real client workspaces today.

This brief has one purpose: to define what Ridge becomes next without breaking what already works.

The expansion thesis is as follows. Ridge's current architecture is a high-functioning prototype with known scaling ceilings. The 10-second Vercel Hobby timeout, single-function backend, and JSON-string database storage are not flaws to be embarrassed about — they are the expected artifacts of a fast-moving founding sprint. The platform has validated the core product loop. The next 90 days are about replacing the scaffolding beneath a working building without collapsing the floors above.

Beyond infrastructure, the brief introduces a Palantir-inspired ontology that formalizes Ridge's data model as a first-class architectural layer. This ontology grounds fifteen object types and twenty link types that underpin twelve purpose-built applications, sixty-plus actions and functions, and a defensible intellectual property position across six patent invention disclosures.

The strategic position is clear: Ridge sits at the intersection of AI strategy generation, account intelligence, and structured client engagement — a combination no incumbent currently owns. Apollo has the data. Gong has the call intelligence. Outreach has the sequencing. None of them have the strategy layer, and none of them are built for the consultative, client-facing delivery model that Ridge enables. That gap is the moat.

The recommended path forward: migrate to Supabase + Next.js + Vercel Pro within 90 days, launch six new applications on top of the normalized ontology, file provisional patents on the six disclosed inventions, and define a pricing model before the first external client pays.

Everything that works today continues to work. Everything built next is additive.

---

## Section A: Platform Audit

### A.1 Architecture Overview

Ridge is a single-page React application backed by a Node.js serverless API deployed on Vercel. The architecture is deliberately minimal, optimized for speed of iteration over operational complexity. Below is a complete map of the current stack.

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 (UMD builds, Babel standalone) | Single `public/index.html`, 3,864 lines, JSX transpiled in browser |
| Backend | Node.js serverless function | Single `api/index.js`, 499 lines, all routes consolidated |
| Database | Neon PostgreSQL | Env vars prefixed `ridge_`, accessed via Vercel Marketplace |
| AI Primary | Anthropic Claude Haiku 4.5 (default), Sonnet 4.5 (strategy) | Anthropic-first with 429 retry logic (1 retry, 5s delay) |
| AI Fallback | OpenAI GPT-4o, GPT-4o-mini, GPT-4o-search-preview | Fallback chain for failures; search-preview for web queries |
| Hosting | Vercel Hobby plan | Auto-deploy from `owen543/ridge-strategy-engine`, `main` branch |
| Domain | platform.joinridge.co | Production |
| CDN | unpkg.com | React 18 UMD builds loaded from CDN |
| Fonts | DM Sans, JetBrains Mono | Design system typography |

**Architectural Constraints to Note**

The decision to consolidate all routes into a single serverless function is a Vercel Hobby plan requirement (function count limits). This is a deliberate trade-off, not an oversight. The consequence is a hard 10-second execution ceiling on any operation, including multi-step AI calls that routinely run longer during strategy generation. This is the primary scaling constraint and the primary driver of the migration recommendation in Section E.

The in-browser Babel transpilation means the frontend has no build step, which accelerates development but prevents code splitting, tree shaking, or any production optimization pipeline. At 3,864 lines in a single file, the SPA is approaching the threshold where this trade-off reverses — adding features increases initial load time with no ability to lazy-load.

---

### A.2 Database Schema

Ridge uses seven PostgreSQL tables. All complex data is stored as JSON strings rather than normalized relational columns. This is functional but limits querying capability and will not scale to the analytics requirements of the expanded platform.

| Table | Primary Key | Key Columns | Notes |
|---|---|---|---|
| `users` | `id` (TEXT) | email (UNIQUE), password_hash, name, role, workspace_id, created_at | Roles: `ridge_admin`, `client` |
| `sessions` | `token` (TEXT) | user_id, created_at | In-memory session token pattern |
| `workspaces` | `id` (TEXT) | name, website, status, type, intake_count, runs_count, client_email, is_client, notes | `intake_count` known to not increment |
| `intake_data` | `workspace_id` (TEXT) | data (JSON string), updated_at | Full intake stored as single JSON blob |
| `strategy_data` | `workspace_id` (TEXT) | data (JSON string), updated_at | All 11 strategy sections in one blob |
| `settings` | `key` (TEXT) | value | Key-value store for platform config |
| `intelligence_data` | `workspace_id` (TEXT) | signals (JSON string), dismissed (JSON string), drafts (JSON string), last_scan_at, scan_count, updated_at | All signals as JSON array |

**Schema Limitations**

JSON string storage means that querying across signals (e.g., "show me all funding signals above relevance score 0.8 across all workspaces") requires full table scan and in-application parsing. Normalized columns would enable indexed queries, cross-workspace aggregations, and analytics dashboards. This migration is addressed in Sprint 1 of the implementation plan.

---

### A.3 Authentication

| Mechanism | Implementation | Security Notes |
|---|---|---|
| Email/password | SHA-256 hashing | Should migrate to bcrypt or Argon2; SHA-256 is not a password-hashing function |
| Google OAuth | Client ID: 647124593506-... | Functional; should migrate to Supabase Auth provider |
| Session tokens | Stored in-memory, passed as query param | No HttpOnly cookie; query param sessions visible in server logs and browser history |
| Roles | `ridge_admin` (full access), `client` (own workspace only) | Two-tier; no granular permissions |
| Admin accounts | owen@ridgeinternal.com, jack@ridgeinternal.com | Hardcoded default admins |

The current auth implementation is adequate for a closed beta with a small number of known users. It is not adequate for a multi-tenant SaaS product. The migration to Supabase Auth in Sprint 1 resolves all of these issues simultaneously: bcrypt hashing, secure session management via HttpOnly cookies, JWT-based token refresh, and Google OAuth via a maintained provider.

---

### A.4 API Surface

All routes are handled by the single `/api/index.js` serverless function via an action-based dispatch pattern.

**Auth Routes**

| Method | Route | Description |
|---|---|---|
| POST | /auth/login | Email/password login |
| GET | /auth/session | Validate session token |
| POST | /auth/logout | Invalidate session |
| POST | /auth/google | Google OAuth callback |

**Resource Routes**

| Method | Route | Description |
|---|---|---|
| GET/POST/DELETE | /users | User management |
| POST | /users/password | Password reset |
| GET/POST/PUT/DELETE | /workspaces | Workspace CRUD |
| GET/POST | /intake | Intake data read/write |
| GET/POST | /strategy | Strategy data read/write |
| GET/POST | /settings | Platform settings |
| GET/POST | /intelligence | Signal data read/write |

**AI Routes (POST /ai with `action` parameter)**

| Action | Description |
|---|---|
| `health` | AI provider health check |
| `scan_website` | Web search + LLM extraction for company profiling |
| `extract_notes` | Meeting notes to structured intake |
| `strategy_part_a` | Research and targeting strategy generation |
| `strategy_part_b` | Execution and messaging strategy generation |
| `summarize_section` | Compress a strategy section |
| `scan_intelligence` | Signal scanning for a workspace |
| `draft_outreach` | AI-assisted message draft from signal context |
| `market_pulse` | Real-time market data retrieval |

**Utility Routes**

| Method | Route | Description |
|---|---|---|
| POST | /seed | Database seeding |
| GET | /health | Platform health check |

---

### A.5 Frontend Components

The frontend comprises 52 components organized into functional domains. The design system uses a dark/light theme with a deep forest green accent (#1C3C34), DM Sans for body text, and JetBrains Mono for code and data display.

**Design System**

| Component | Description |
|---|---|
| Icon | 50+ SVG icons, inline rendering |
| Btn | Primary/secondary/ghost variants |
| Input | Controlled text input with validation states |
| Select | Dropdown with option groups |
| Card | Container with dark/light surface variants |
| Badge | Status and count indicators |
| Field | Form field wrapper with label and error |
| CopyBtn | One-click copy with confirmation |
| Skeleton | Loading placeholder |
| ToastContainer | Notification system |
| RadialGauge | Circular score display |
| ScoreBar | Linear score bar |
| ArcLoader | Circular progress indicator |
| OrbitalLoader | Full-screen loading animation |

**Layout Components**

| Component | Description |
|---|---|
| Sidebar | Collapsible navigation with workspace context |
| HeaderBar | Breadcrumb navigation |
| StatusBar | Live clock, version (v2.1.0), online indicator |
| ModalOverlay | Modal scaffold with backdrop |

**Application Components**

| Domain | Components |
|---|---|
| Auth | LoginScreen (email/password + Google SSO) |
| Admin | AdminDashboard, WorkspacesView, WorkspaceDetail, ManageAccountsInline |
| Intake | IntakeForm (6 sections, 23 fields, website scanner, meeting notes import) |
| Strategy | StrategyGenerator (parallel dual-API), StrategyView (11-tab renderer) |
| Strategy Tabs | ICPTab, DMTab, ChannelTab, MessagingTab, ValuePropTab, MeetingTab, SalesNavTab, RiskTab, FlowTab, FollowupTab, ExecTab |
| Intelligence | IntelligenceFeed, MarketPulse, SignalCard |
| Client Portal | ClientDashboard, ClientPortal (Overview, Intake, Strategy, Intelligence) |
| Account Mgmt | ManageAccountsView, ManageAccountsInline |

---

### A.6 Live Platform State

Audit conducted April 17, 2026 via browser inspection of platform.joinridge.co.

| Dimension | Current State |
|---|---|
| Workspaces | 4 total (1 "palantir", 3 "Arunjay" — test data) |
| Admin users | 2 (Owen, Jack) |
| Strategy runs | 1 completed (Arunjay workspace) |
| Intelligence signals | 48 active, 18 high priority |
| Signal types active | 15 of 16 defined types |
| Market Pulse | Live (S&P 500, NASDAQ, 10Y yield, VIX loading in real time) |
| Default theme | Dark mode; light mode toggle instant |
| Strategy tabs | All 11 tabs rendering with AI-generated content |
| Website scanner | Functional (Anthropic search, OpenAI fallback) |
| Meeting notes import | Functional (Circleback source supported) |
| Inline editing | Active on intake form fields |
| Platform version | v2.1.0 |
| Status indicator | ONLINE |

**Signal Type Coverage**

| Signal Type | Status |
|---|---|
| funding | Active |
| hiring | Active |
| leadership_change | Active |
| earnings | Active |
| competitor | Active |
| regulatory | Active |
| product_launch | Active |
| market_trend | Active |
| expansion | Active |
| layoff | Active |
| acquisition | Active |
| partnership | Active |
| pain_signal | Active |
| tech_adoption | Active |
| social_post | Active |
| (16th type) | Defined, not yet observed |

---

### A.7 Known Issues and Technical Gaps

| # | Issue | Severity | Sprint Target |
|---|---|---|---|
| 1 | No URL routing — SPA stays at platform.joinridge.co throughout | Medium | Sprint 2 |
| 2 | `intake_count` always shows 0 (not incremented on save) | Low | Sprint 1 |
| 3 | Duplicate workspace names allowed | Low | Sprint 1 |
| 4 | No Forgot Password flow | Medium | Sprint 1 |
| 5 | No data export (CSV/PDF) beyond Sales Nav copy | Medium | Sprint 3 |
| 6 | No pagination on workspaces or signals | Medium | Sprint 2 |
| 7 | All complex data stored as JSON strings | High | Sprint 1 |
| 8 | Single serverless function = 10s Vercel Hobby timeout | Critical | Sprint 1 |
| 9 | No webhook or real-time updates | Medium | Sprint 2 |
| 10 | No audit log or activity tracking | High | Sprint 2 |
| 11 | No file/document attachments | Low | Sprint 2 |
| 12 | No multi-tenant data isolation beyond workspace_id FK | High | Sprint 1 |

---

## Section B: The Ridge Ontology

### B.1 Architecture Philosophy

The Ridge Ontology is modeled on Palantir Foundry's three-layer semantic architecture, adapted for the B2B sales intelligence domain. The three layers are:

**Semantic Layer** — What things are. Object Types define the nouns of the Ridge world: organizations, contacts, signals, strategies, messages. Link Types define the verbs: employs, targets, generates, mentions, books. Together these constitute the ontological vocabulary.

**Kinetic Layer** — What things do. Actions write data back to the ontology. Functions compute derived intelligence from existing objects. This layer is what makes Ridge an engine rather than a dashboard.

**Dynamic Layer** — How things move. Workflows orchestrate sequences of Actions. Alerts trigger when Function outputs cross thresholds. Schedules run Actions on cadences. This layer closes the loop between intelligence and activity.

The ontology is not a database schema — it is a semantic layer that sits above the database and provides a stable conceptual interface even as the underlying storage evolves.

---

### B.2 Object Types

#### OT-01: Organization

The primary prospect or target company entity.

| Property | Type | Description |
|---|---|---|
| id | String | `org_[ulid]` |
| name | String | Legal or operating name |
| domain | String | Primary web domain |
| industry | Enum | SaaS, FinTech, HealthTech, Manufacturing, etc. |
| employee_count | Integer | Headcount |
| employee_range | Enum | 1-10, 11-50, 51-200, 201-500, 501-2000, 2000+ |
| revenue_range | Enum | <$1M, $1-10M, $10-50M, $50-250M, $250M+ |
| tech_stack | Array[String] | Known technologies in use |
| funding_stage | Enum | Bootstrapped, Pre-Seed, Seed, Series A-E, Public |
| total_funding_usd | Integer | Cumulative funding raised |
| founded_year | Integer | Year of founding |
| headquarters_city | String | City |
| headquarters_country | String | ISO country code |
| linkedin_url | URL | Company LinkedIn page |
| website | URL | Primary website |
| description | String | Company description |
| icp_fit_score | Float | Computed — see Function FN-01 |
| signal_count | Integer | Computed — count of related signals |
| last_signal_at | Timestamp | Computed — most recent signal date |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

Status values: `active`, `archived`, `do_not_contact`

---

#### OT-02: Contact

A person at an organization.

| Property | Type | Description |
|---|---|---|
| id | String | `contact_[ulid]` |
| organization_id | String | FK to Organization |
| first_name | String | Given name |
| last_name | String | Family name |
| full_name | String | Computed |
| title | String | Job title |
| department | Enum | Sales, Marketing, Engineering, Finance, Operations, Executive, Legal, HR |
| seniority_level | Enum | IC, Manager, Director, VP, C-Suite, Founder |
| email | Email | Primary email |
| linkedin_url | URL | Personal LinkedIn |
| phone | Phone | Direct phone |
| tenure_months | Integer | Months at current organization |
| is_decision_maker | Boolean | Whether contact is a buying authority |
| reachability_score | Float | Computed — see Function FN-07 |
| last_engaged_at | Timestamp | Most recent engagement timestamp |
| created_at | Timestamp | Record creation |

Status values: `active`, `bounced`, `unsubscribed`, `do_not_contact`

---

#### OT-03: Workspace

Extends the existing workspace table. A Ridge client engagement container.

| Property | Type | Description |
|---|---|---|
| id | String | `ws_[ulid]` |
| name | String | Client/engagement name (unique enforced) |
| website | URL | Client website |
| client_email | Email | Primary client contact email |
| status | Enum | `active`, `draft`, `paused`, `completed`, `archived` |
| type | String | Engagement type |
| is_client | Boolean | Whether workspace has a client portal login |
| intake_count | Integer | Number of intake saves (fix: increment on save) |
| runs_count | Integer | Number of strategy generation runs |
| health_score | Float | Computed — see Function FN-06 |
| strategy_freshness_days | Integer | Computed — see Function FN-08 |
| notes | String | Admin notes |
| team_id | String | FK to Team |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

---

#### OT-04: Intake

Structured client business context. One per workspace (upserted, not versioned — migration to versioned in Sprint 2).

| Property | Type | Description |
|---|---|---|
| id | String | `intake_[ulid]` |
| workspace_id | String | FK to Workspace |
| company_name | String | Client company name |
| company_description | String | What the company does |
| offer | String | The specific product/service offered |
| offer_type | Enum | Product, Service, Platform, Consulting |
| target_market | String | Broad market description |
| icp_industries | Array[String] | Target industries |
| icp_company_sizes | Array[String] | Target company sizes |
| icp_geographies | Array[String] | Target geographies |
| icp_titles | Array[String] | Target decision-maker titles |
| value_propositions | Array[String] | Core value props |
| pain_points | Array[String] | Customer pain points addressed |
| objections | Array[String] | Known or anticipated objections |
| competitive_alternatives | Array[String] | What prospects use instead |
| average_deal_size | String | ACV or deal size range |
| sales_cycle_days | Integer | Typical sales cycle length |
| constraints | String | Budget, timing, resource constraints |
| source | Enum | `manual`, `website_scan`, `meeting_notes` |
| scan_url | URL | Source URL if from website scan |
| notes_source | Enum | `circleback`, `granola`, `fathom`, `otter`, `manual` |
| version | Integer | Intake version number |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

---

#### OT-05: Strategy

AI-generated go-to-market strategy with eleven sections.

| Property | Type | Description |
|---|---|---|
| id | String | `strategy_[ulid]` |
| workspace_id | String | FK to Workspace |
| intake_id | String | FK to Intake (snapshot at generation time) |
| version | Integer | Incrementing strategy version |
| model_a | String | Model used for Part A (research/targeting) |
| model_b | String | Model used for Part B (execution/messaging) |
| generation_duration_ms | Integer | Total generation time |
| icp | JSON | Ideal customer profile section |
| decision_makers | JSON | DM targeting section |
| channels | JSON | Channel recommendations |
| messaging | JSON | Core messaging framework |
| value_prop | JSON | Value proposition section |
| meeting_framework | JSON | Meeting structure and agenda |
| sales_nav | JSON | Sales Navigator filters and boolean strings |
| risk_assessment | JSON | Risk model and objection handling |
| flow | JSON | Engagement flow and sequence logic |
| followup | JSON | Follow-up cadence and nurture logic |
| executive_summary | JSON | Executive summary section |
| freshness_score | Float | Computed — see Function FN-08 |
| created_at | Timestamp | Generation timestamp |

Status values: `generating`, `complete`, `failed`, `archived`

---

#### OT-06: Signal

A sales intelligence event detected about a target organization.

| Property | Type | Description |
|---|---|---|
| id | String | `signal_[ulid]` |
| workspace_id | String | FK to Workspace |
| organization_id | String | FK to Organization (if resolved) |
| type | Enum | funding, hiring, leadership_change, earnings, competitor, regulatory, product_launch, market_trend, expansion, layoff, acquisition, partnership, pain_signal, tech_adoption, social_post |
| headline | String | Brief signal description |
| summary | String | Longer signal detail |
| source_url | URL | Source article or page |
| source_name | String | Publication or platform |
| urgency | Enum | `critical`, `high`, `medium`, `low` |
| relevance_score | Float | 0.0-1.0, computed against ICP — see Function FN-03 |
| is_dismissed | Boolean | Whether user has dismissed |
| dismissed_at | Timestamp | Dismissal timestamp |
| dismissed_by | String | FK to User |
| draft_message_id | String | FK to Message if draft generated |
| detected_at | Timestamp | When signal was detected |
| created_at | Timestamp | Record creation |

---

#### OT-07: Sequence

A multi-step, multi-channel messaging campaign targeting contacts at an organization.

| Property | Type | Description |
|---|---|---|
| id | String | `seq_[ulid]` |
| workspace_id | String | FK to Workspace |
| strategy_id | String | FK to Strategy (source) |
| name | String | Sequence name |
| description | String | Campaign goal |
| channel_mix | Array[Enum] | email, linkedin, phone, sms |
| step_count | Integer | Number of messages in sequence |
| spacing_days | Array[Integer] | Days between steps |
| status | Enum | `draft`, `active`, `paused`, `completed` |
| target_seniority | Enum | IC, Director+, VP+, C-Suite Only |
| contact_count | Integer | Number of enrolled contacts |
| performance | JSON | Computed — see Function FN-09 |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

---

#### OT-08: Message

A single outreach message within a sequence.

| Property | Type | Description |
|---|---|---|
| id | String | `msg_[ulid]` |
| sequence_id | String | FK to Sequence |
| contact_id | String | FK to Contact |
| workspace_id | String | FK to Workspace |
| channel | Enum | `email`, `linkedin`, `phone`, `sms` |
| subject | String | Email subject line (if email) |
| body | String | Message body |
| step_number | Integer | Position in sequence (1-indexed) |
| quality_score | Float | 0-100, AI-evaluated — see Function FN-02 |
| quality_notes | String | AI quality feedback |
| angle | String | Messaging angle used |
| signal_id | String | FK to Signal (if signal-triggered) |
| sent_at | Timestamp | Send timestamp |
| status | Enum | `draft`, `scheduled`, `sent`, `failed` |
| created_at | Timestamp | Record creation |

---

#### OT-09: Engagement

A tracked interaction event on a message.

| Property | Type | Description |
|---|---|---|
| id | String | `eng_[ulid]` |
| message_id | String | FK to Message |
| contact_id | String | FK to Contact |
| workspace_id | String | FK to Workspace |
| type | Enum | `open`, `click`, `reply`, `meeting_booked`, `unsubscribe`, `bounce` |
| occurred_at | Timestamp | Event timestamp |
| reply_body | String | Reply content (if type=reply) |
| sentiment | Enum | `positive`, `neutral`, `negative` (if reply) |
| created_at | Timestamp | Record creation |

---

#### OT-10: Meeting

A scheduled or completed meeting with a prospect.

| Property | Type | Description |
|---|---|---|
| id | String | `meeting_[ulid]` |
| workspace_id | String | FK to Workspace |
| contact_id | String | FK to Contact |
| organization_id | String | FK to Organization |
| engagement_id | String | FK to Engagement (booking event) |
| type | Enum | `discovery`, `demo`, `follow_up`, `proposal`, `negotiation`, `close` |
| scheduled_at | Timestamp | Meeting date/time |
| duration_minutes | Integer | Meeting length |
| status | Enum | `scheduled`, `completed`, `no_show`, `cancelled` |
| outcome | Enum | `advanced`, `stalled`, `lost`, `won` |
| notes | String | Meeting notes |
| action_items | Array[String] | Follow-up action items |
| recording_url | URL | Call recording link |
| notetaker_source | Enum | `circleback`, `granola`, `fathom`, `otter`, `manual` |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

---

#### OT-11: Pipeline

A deal or opportunity tracker.

| Property | Type | Description |
|---|---|---|
| id | String | `pipeline_[ulid]` |
| workspace_id | String | FK to Workspace |
| organization_id | String | FK to Organization |
| contact_id | String | FK to primary Contact |
| name | String | Deal name |
| stage | Enum | `prospecting`, `qualified`, `demo`, `proposal`, `negotiation`, `closed_won`, `closed_lost` |
| value_usd | Integer | Expected deal value |
| probability | Float | 0.0-1.0 close probability |
| expected_close_date | Date | Target close date |
| weighted_value | Float | Computed: value_usd * probability |
| days_in_stage | Integer | Computed — see Function FN-04 |
| pipeline_velocity | Float | Computed — see Function FN-04 |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

Status values: `active`, `stalled`, `won`, `lost`

---

#### OT-12: Playbook

A reusable strategy template derived from successful strategies.

| Property | Type | Description |
|---|---|---|
| id | String | `pb_[ulid]` |
| name | String | Playbook name |
| description | String | Use case and context |
| industry | Enum | Target industry |
| company_size_range | Enum | Target company size |
| offer_type | Enum | Product, Service, Platform, Consulting |
| template_data | JSON | Strategy template content |
| success_rate | Float | Computed — win rate when applied |
| usage_count | Integer | Number of times applied |
| created_by | String | FK to User |
| created_at | Timestamp | Record creation |
| updated_at | Timestamp | Last modification |

Status values: `draft`, `published`, `deprecated`

---

#### OT-13: Team

A group of users with shared workspace access and permissions.

| Property | Type | Description |
|---|---|---|
| id | String | `team_[ulid]` |
| name | String | Team name |
| description | String | Team purpose |
| member_count | Integer | Computed |
| workspace_count | Integer | Computed |
| created_at | Timestamp | Record creation |

---

#### OT-14: Integration

A connected external system.

| Property | Type | Description |
|---|---|---|
| id | String | `int_[ulid]` |
| workspace_id | String | FK to Workspace (null = global) |
| type | Enum | `crm_salesforce`, `crm_hubspot`, `email_gmail`, `email_outlook`, `calendar_google`, `calendar_outlook`, `notetaker_circleback`, `enrichment_apollo`, `enrichment_clay` |
| name | String | Display name |
| credentials | JSON | Encrypted OAuth tokens / API keys |
| status | Enum | `connected`, `error`, `expired`, `disconnected` |
| last_sync_at | Timestamp | Most recent successful sync |
| sync_count | Integer | Total successful syncs |
| created_at | Timestamp | Record creation |

---

#### OT-15: AuditEvent

An immutable activity log entry. Write-once, no updates, no deletes.

| Property | Type | Description |
|---|---|---|
| id | String | `audit_[ulid]` |
| actor_user_id | String | FK to User |
| action | String | Action name (e.g., `workspace.create`, `strategy.generate`) |
| object_type | String | Affected object type |
| object_id | String | Affected object ID |
| workspace_id | String | FK to Workspace (if applicable) |
| metadata | JSON | Additional context |
| ip_address | String | Request IP |
| occurred_at | Timestamp | Event timestamp (immutable) |

---

### B.3 Link Types

| # | Source | Relation | Target | Cardinality | Description |
|---|---|---|---|---|---|
| LT-01 | Organization | employs | Contact | 1:N | An organization has many contacts |
| LT-02 | Workspace | targets | Organization | N:M | A workspace tracks many organizations; an org may appear in many workspaces |
| LT-03 | Workspace | contains | Intake | 1:1 | Each workspace has one active intake |
| LT-04 | Workspace | has | Strategy | 1:N | A workspace may have multiple strategy versions |
| LT-05 | Strategy | generates | Sequence | 1:N | A strategy is the source for one or more sequences |
| LT-06 | Signal | mentions | Organization | N:M | A signal may reference multiple organizations; an org may appear in many signals |
| LT-07 | Signal | triggers | Message | 1:N | A signal may trigger one or more drafted messages |
| LT-08 | Message | belongs_to | Sequence | N:1 | Many messages compose a sequence |
| LT-09 | Message | targets | Contact | N:1 | A message is addressed to a specific contact |
| LT-10 | Engagement | responds_to | Message | 1:1 | Each engagement event is tied to one message |
| LT-11 | Contact | books | Meeting | 1:N | A contact may have many meetings |
| LT-12 | Meeting | advances | Pipeline | 1:N | A completed meeting may advance one or more pipeline deals |
| LT-13 | Pipeline | associated_with | Organization | N:1 | Many deals may exist per organization |
| LT-14 | Workspace | owned_by | Team | N:1 | Many workspaces may belong to one team |
| LT-15 | Integration | connects | Workspace | N:1 | An integration may serve one workspace or be global |
| LT-16 | Playbook | instantiates | Strategy | 1:N | A playbook is a template that can produce many strategies |
| LT-17 | AuditEvent | logs | Workspace | N:1 | Audit events are scoped to a workspace |
| LT-18 | Contact | enrolled_in | Sequence | N:M | A contact may be in multiple sequences; sequences have many contacts |
| LT-19 | Intake | sources | Strategy | 1:N | One intake may produce multiple strategy versions |
| LT-20 | Organization | scored_by | Intake | N:M | An org is ICP-scored against one or more intake profiles |

---

### B.4 Property Type Reference

| Base Type | Description | Example |
|---|---|---|
| String | Variable-length text | `"Acme Corp"` |
| Integer | Whole number | `250` |
| Float | Decimal number | `0.87` |
| Boolean | True/false flag | `true` |
| Timestamp | ISO 8601 datetime with timezone | `2026-04-17T14:23:00Z` |
| Date | ISO 8601 date | `2026-04-17` |
| JSON | Structured object or array | `{"key": "value"}` |
| Array[String] | Ordered list of strings | `["SaaS", "FinTech"]` |
| Enum | Constrained value set | `"active"` |
| URL | Valid HTTP/HTTPS URL | `"https://example.com"` |
| Email | Valid email address | `"owner@example.com"` |
| Phone | E.164 formatted phone | `"+14155551234"` |

---

## Section C: The Ridge Application Suite

The Ridge Application Suite is twelve purpose-built applications that compose the platform. Each application operates on a specific set of ontology objects and provides a focused user experience. Applications share data through the ontology layer and do not communicate directly with each other.

---

### App 01: Command Center

**Tagline:** The operational hub for every active client engagement.

**Primary Objects:** Workspace, Team, AuditEvent

**Key Views:**
- Workspace grid with health score badges and strategy freshness indicators
- Quick-action panel: create workspace, run strategy, scan signals
- Cross-workspace activity feed drawing from AuditEvent
- Team performance summary

**User Stories:**
- As an admin, I want to see all active workspaces ranked by health score so I can prioritize my attention.
- As an admin, I want to create a new workspace in under 60 seconds using the quick-action panel.
- As a team lead, I want to see a summary of strategy runs and signal scans across all workspaces this week.
- As an admin, I want to archive a completed workspace without deleting its data.
- As an admin, I want to filter workspaces by status, type, or assigned team member.

**Existing Functionality Extended:** Extends the current WorkspacesView and AdminDashboard. Adds health score column, strategy freshness indicator, and cross-workspace activity feed. All existing workspace CRUD operations remain intact.

---

### App 02: Intake Engine

**Tagline:** Transform raw business context into structured intelligence in minutes.

**Primary Objects:** Intake, Workspace, Organization

**Key Views:**
- Guided intake form (6 sections, 23 fields — existing)
- Website scanner with live field preview
- Meeting notes import with source selector (Circleback, Granola, Fathom, Otter)
- Intake diff viewer: compare current version against previous
- Field-level confidence indicators for scanned/extracted data

**User Stories:**
- As an admin, I want to scan a client's website and have their company profile, ICP, and pain points auto-populated so I can complete intake in 5 minutes rather than 30.
- As an admin, I want to paste Circleback meeting notes and have them mapped to intake fields automatically.
- As an admin, I want to see which fields were auto-populated vs. manually entered so I can review AI-extracted data before saving.
- As a client, I want to review and edit my intake form through the client portal without exposing admin-only fields.
- As an admin, I want to see the intake version history so I understand how the client's context has evolved.

**Existing Functionality Extended:** Extends the current IntakeForm. Adds version history, field confidence indicators, multi-source notes import (beyond Circleback), and intake diff view. All 23 existing fields and scanning functionality remain.

---

### App 03: Strategy Engine

**Tagline:** AI-generated go-to-market strategies built from your client's exact business context.

**Primary Objects:** Strategy, Intake, Workspace, Playbook

**Key Views:**
- Strategy generation control panel (existing StrategyGenerator)
- Eleven-tab strategy renderer (existing StrategyView — all 11 tabs)
- Strategy version comparison (side-by-side diff across versions)
- One-click section regeneration
- Strategy export (PDF/DOCX)
- Playbook save: promote a strategy section to reusable template

**User Stories:**
- As an admin, I want to regenerate the Messaging tab without re-running the entire strategy.
- As an admin, I want to compare the current strategy against a previous version to see what changed.
- As an admin, I want to export the full strategy as a PDF to share with a client.
- As an admin, I want to save the Messaging section as a playbook template for future engagements in the same industry.
- As an admin, I want to see how long strategy generation took and which models were used.

**Existing Functionality Extended:** DO NOT REBUILD. The parallel dual-API generation, JSON repair pipeline, and all eleven strategy tabs are extended — not replaced. New capabilities (versioning, export, section regeneration, playbook promotion) are added as discrete features on top of the existing StrategyGenerator and StrategyView components.

---

### App 04: Signal Intelligence

**Tagline:** Real-time market and account signals converted into actionable engagement context.

**Primary Objects:** Signal, Organization, Workspace, Message

**Key Views:**
- Signal feed with urgency tiers and type filters (existing IntelligenceFeed — extended)
- Signal detail drawer with organization context and ICP fit score
- One-click draft message from signal context
- Signal trend chart (type frequency over time)
- Market Pulse widget (existing, real-time market data)
- Dismissed signal archive with restore capability

**User Stories:**
- As an admin, I want to filter signals by type (funding, hiring, etc.) and urgency level so I can focus on the highest-value triggers.
- As an admin, I want to click a funding signal and immediately generate a draft LinkedIn message that incorporates the signal context and the client's strategy.
- As an admin, I want to see signal trend data over 30 days to identify which signal types are most active for a given workspace.
- As a client, I want to view high-priority signals for my account through the client portal so I understand why Ridge is recommending specific actions.
- As an admin, I want to restore a dismissed signal in case it becomes relevant again.

**Existing Functionality Extended:** Extends IntelligenceFeed and MarketPulse. Adds signal trend visualization, organization context panel, ICP fit score display in signal cards, and dismissed signal archive. All 48 current signals and 16 signal types remain accessible.

---

### App 05: Sequence Builder

**Tagline:** Design multi-step, multi-channel engagement campaigns grounded in your strategy.

**Primary Objects:** Sequence, Message, Contact, Strategy, Organization

**Key Views:**
- Visual sequence builder: drag-and-drop step canvas
- Channel selector per step (email, LinkedIn, phone, SMS)
- Contact enrollment panel: add/remove contacts from sequence
- Sequence preview: rendered messages per contact
- Sequence performance dashboard (live, once messages are sent)

**User Stories:**
- As an admin, I want to build a 5-step email + LinkedIn sequence from the messaging section of a strategy in under 10 minutes.
- As an admin, I want to define spacing between steps (e.g., Day 1, Day 3, Day 7) and set channel per step.
- As an admin, I want to enroll specific contacts at target organizations into a sequence.
- As an admin, I want to pause a sequence for a specific contact if they reply.
- As an admin, I want to clone a sequence from one workspace and adapt it for another.

**New Capability:** No existing sequence functionality. Sequence Builder is a net-new application. It reads from Strategy (for messaging angles) and writes to Sequence and Message objects.

---

### App 06: Message Studio

**Tagline:** AI-assisted message composition with real-time quality scoring and seniority-aware targeting.

**Primary Objects:** Message, Contact, Signal, Sequence, Intake

**Key Views:**
- Message composer with rich text editor
- AI generation panel: generate from strategy angle, signal context, or custom prompt
- Quality score display (0-100 with breakdown notes)
- Seniority targeting policy selector
- Message variant generator (A/B)
- Message history and performance view

**User Stories:**
- As an admin, I want to generate a cold LinkedIn message for a VP of Sales at a Series B fintech company and receive a quality score with specific improvement suggestions.
- As an admin, I want to select a seniority policy (C-Suite Only) and have the message tone, CTA style, and length automatically adjusted.
- As an admin, I want to generate two message variants (A and B) and compare their quality scores before choosing one.
- As an admin, I want to see which messaging angles have historically produced the highest quality scores across this workspace.
- As a client, I want to review and approve messages before they are sent on my behalf.

**New Capability:** Extends the existing `draft_outreach` AI action. Quality scoring, seniority-aware targeting policy, and A/B variant generation are net-new capabilities built on top of existing AI infrastructure.

---

### App 07: Pipeline Tracker

**Tagline:** Deal progression tracking and revenue forecasting connected to your engagement activity.

**Primary Objects:** Pipeline, Organization, Contact, Meeting, Engagement

**Key Views:**
- Kanban board by pipeline stage
- Pipeline list view with sort and filter
- Deal detail: full organization context, contact history, meetings, messages
- Revenue forecast summary (weighted pipeline by close date)
- Stage velocity report

**User Stories:**
- As an admin, I want to create a new deal for an organization directly from a Signal or Meeting.
- As an admin, I want to move a deal from Qualified to Demo stage after booking a meeting, with a single drag action.
- As an admin, I want to see the total weighted pipeline value across all workspaces on the Command Center dashboard.
- As an admin, I want to set a close date probability on each deal and see the updated forecast automatically.
- As a client, I want to view my current pipeline status through the client portal.

**New Capability:** Pipeline Tracker is net-new. It reads from Organization, Contact, Meeting, and Engagement objects and writes to Pipeline.

---

### App 08: Meeting Prep

**Tagline:** AI-generated pre-meeting intelligence briefings and structured post-meeting capture.

**Primary Objects:** Meeting, Organization, Contact, Strategy, Signal, Intake

**Key Views:**
- Meeting briefing generator: one-click pre-meeting intelligence pack
- Briefing view: company context, contact background, recent signals, recommended talking points
- Post-meeting capture form: outcome, notes, action items
- Meeting notes import for post-meeting (Circleback, Granola, Fathom, Otter)
- Meeting history by organization and contact

**User Stories:**
- As an admin, I want to generate a one-page meeting briefing 30 minutes before a discovery call that includes the prospect's recent signals, ICP fit score, and recommended questions from the strategy.
- As an admin, I want to capture meeting notes and outcome immediately after a call and have them mapped to the relevant intake fields for strategy updates.
- As an admin, I want to see all past meetings with a prospect in chronological order with outcomes noted.
- As a client, I want to receive a post-meeting summary in my client portal after each call.
- As an admin, I want to import Circleback notes into a completed meeting record rather than re-entering them manually.

**Existing Functionality Extended:** Extends the existing MeetingTab in the Strategy view and the meeting notes import capability in IntakeForm. Meeting Prep builds a new app around these capabilities while keeping them functional in their original contexts.

---

### App 09: Analytics Hub

**Tagline:** Cross-workspace performance dashboards for platform-wide visibility and optimization.

**Primary Objects:** Workspace, Strategy, Signal, Sequence, Message, Engagement, Pipeline

**Key Views:**
- Platform overview: active workspaces, strategies generated, signals detected, messages sent
- Engagement analytics: send rate, reply rate, meeting booked rate, by workspace and sequence
- Signal analytics: signal volume by type, urgency distribution, trending signal types
- Pipeline analytics: total pipeline value, weighted forecast, stage conversion rates
- Message quality distribution: quality score histograms by angle and channel

**User Stories:**
- As an admin, I want to see which messaging angle produces the highest reply rate across all workspaces.
- As an admin, I want to compare engagement rates across two client workspaces to identify best practices.
- As an admin, I want to see the total number of signals detected per week over the past 90 days.
- As an admin, I want to identify which strategy sections are most frequently regenerated (indicating they need improvement).
- As an admin, I want to export an analytics report as a PDF to share with an investor.

**New Capability:** Analytics Hub is net-new. It reads from all major object types and surfaces computed Function outputs. It does not write to any objects.

---

### App 10: Client Portal

**Tagline:** A clean, self-service window into Ridge's work for your clients.

**Primary Objects:** Workspace, Strategy, Signal, Pipeline, Meeting, Intake

**Key Views:**
- Overview (existing ClientPortal Overview tab — extended)
- Strategy view (read-only, all 11 tabs)
- Signal feed (high-priority signals only, curated view)
- Pipeline view (deal status and forecast)
- Intake review (client-facing fields only)
- Meeting history and upcoming meetings

**User Stories:**
- As a client, I want to log into my portal and see a summary of what Ridge has done for me this week.
- As a client, I want to read my full strategy across all 11 sections without being able to edit it.
- As a client, I want to see which signals Ridge detected about my target market this week.
- As a client, I want to view my current pipeline status and weighted forecast.
- As a client, I want to edit certain intake fields (my company description, offer, constraints) directly from my portal.

**Existing Functionality Extended:** Extends the current ClientDashboard and ClientPortal components (Overview, Intake, Strategy, Intelligence tabs). Adds Pipeline and Meeting History views, and expands Signal Intelligence to a curated, client-safe feed.

---

### App 11: Admin Console

**Tagline:** Platform administration, user management, and integration configuration.

**Primary Objects:** Users, Team, Workspace, Integration, AuditEvent, Settings

**Key Views:**
- User management: CRUD, role assignment, password reset (existing ManageAccountsView — extended)
- Team management: create teams, assign users and workspaces
- Integration panel: connect CRM, email, calendar, and data enrichment tools
- Audit log: searchable, filterable activity history
- Platform settings: AI model preferences, usage limits, branding

**User Stories:**
- As an admin, I want to create a new client user account, assign it to a workspace, and send them a portal login invitation in one flow.
- As an admin, I want to connect a HubSpot integration and map Ridge pipeline stages to HubSpot deal stages.
- As an admin, I want to search the audit log for all actions taken in a specific workspace over the past 30 days.
- As an admin, I want to set the default AI model for strategy generation at the platform level.
- As an admin, I want to reset a user's password without requiring them to go through a forgot-password flow.

**Existing Functionality Extended:** Extends the existing ManageAccountsView and ManageAccountsInline components. Adds team management, integration panel, audit log, and platform settings. All existing CRUD and password reset functionality remains.

---

### App 12: Playbook Library

**Tagline:** Reusable strategy templates that encode Ridge's best thinking for rapid deployment.

**Primary Objects:** Playbook, Strategy, Intake, Workspace

**Key Views:**
- Playbook grid with filter by industry, offer type, company size
- Playbook detail: full template content preview
- Playbook editor: edit and publish template
- Apply playbook: instantiate a playbook as a new strategy draft for a workspace
- Playbook performance: win rates and usage counts

**User Stories:**
- As an admin, I want to save the Messaging section from a high-performing strategy as a reusable template for SaaS companies targeting VP of Engineering.
- As an admin, I want to browse the playbook library and apply a template to a new workspace to pre-populate the strategy before running AI generation.
- As an admin, I want to see which playbooks have the highest success rates based on engagement and pipeline outcomes.
- As an admin, I want to publish a playbook to all team members so they can use it on their workspaces.
- As an admin, I want to deprecate an outdated playbook without deleting it from historical records.

**New Capability:** Playbook Library is net-new. It reads from Strategy (to extract templates) and writes to Playbook. It interacts with Strategy Engine when instantiating templates.

---

## Section D: Actions and Functions — The Kinetic Layer

### D.1 Actions

Actions are operations that create, update, or delete objects and may trigger side effects. All actions are logged as AuditEvent records.

---

#### ACT-01: Create Workspace

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | name (String, required, unique), website (URL, optional), client_email (Email, optional), type (Enum), team_id (String, optional) |
| Affected Objects | Workspace (CREATE), AuditEvent (CREATE) |
| Validation | Name uniqueness check. Website URL format validation. |
| Side Effects | Creates empty Intake record linked to workspace. Generates workspace ID with `ws_` prefix. Sends invitation email if client_email provided and is_client=true. |
| Rollback | Delete created workspace and intake records on failure. |

---

#### ACT-02: Import Intake

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (website scan, notes extraction) |
| Inputs | workspace_id (String), source (Enum: manual / website_scan / meeting_notes), source_url (URL, optional), notes_text (String, optional), notes_source (Enum, optional) |
| Affected Objects | Intake (CREATE or UPSERT), Workspace (UPDATE: intake_count + 1), AuditEvent (CREATE) |
| Validation | Workspace must exist and be active. For website_scan: URL must be reachable. For meeting_notes: text must be non-empty. |
| Side Effects | Selective merge: auto-populated fields fill only empty values; existing user edits are preserved. Increments workspace.intake_count on every save. |
| Rollback | Restore previous intake version on failure. |

---

#### ACT-03: Generate Strategy

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | workspace_id (String), model_override_a (String, optional), model_override_b (String, optional) |
| Affected Objects | Strategy (CREATE), Workspace (UPDATE: runs_count + 1), AuditEvent (CREATE) |
| Validation | Workspace must have completed intake (minimum required fields populated). Active strategy generation must not be in progress for same workspace. |
| Side Effects | Dispatches parallel API calls (Part A: Research/Targeting, Part B: Execution/Messaging). Applies 9-stage JSON repair pipeline on response. Sets strategy status to `generating` then `complete` or `failed`. |
| Rollback | Set strategy status to `failed` with error metadata. Workspace.runs_count is not decremented (failed runs are counted). |

---

#### ACT-04: Scan Signals

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (scheduled, daily) |
| Inputs | workspace_id (String), signal_types (Array[Enum], optional — defaults to all) |
| Affected Objects | Signal (CREATE, multiple), intelligence_data (UPDATE), AuditEvent (CREATE) |
| Validation | Workspace must have active intake with ICP defined. Last scan must be more than 1 hour ago (rate limit). |
| Side Effects | Computes relevance_score for each signal against workspace ICP. Triggers push notification if any signals are urgency=critical. Updates last_scan_at and scan_count. |
| Rollback | Delete newly created signals on failure. Do not update last_scan_at on failed scan. |

---

#### ACT-05: Draft Message

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (signal-triggered) |
| Inputs | workspace_id (String), contact_id (String, optional), signal_id (String, optional), channel (Enum), angle (String, optional), seniority_policy (Enum) |
| Affected Objects | Message (CREATE), Signal (UPDATE: draft_message_id if signal-triggered), AuditEvent (CREATE) |
| Validation | Workspace must have active strategy. Seniority policy must match contact's seniority_level if contact_id provided. |
| Side Effects | Computes quality_score and quality_notes via FN-02. Links message to signal if signal_id provided. |
| Rollback | Delete created message on failure. |

---

#### ACT-06: Send Message

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | message_id (String), integration_id (String) |
| Affected Objects | Message (UPDATE: status=sent, sent_at), Engagement (CREATE: type=sent), AuditEvent (CREATE) |
| Validation | Message must be in `draft` or `scheduled` status. Integration must be connected and not expired. |
| Side Effects | Dispatches message via connected integration (email, LinkedIn). Creates Engagement record with type=sent. |
| Rollback | Set message status back to `draft` on delivery failure. Create Engagement record with type=failed. |

---

#### ACT-07: Record Engagement

| Attribute | Detail |
|---|---|
| Trigger | System (webhook from integration) or User (manual log) |
| Inputs | message_id (String), type (Enum), occurred_at (Timestamp), reply_body (String, optional) |
| Affected Objects | Engagement (CREATE), Contact (UPDATE: last_engaged_at), AuditEvent (CREATE) |
| Validation | Message must exist. Type must be valid Engagement enum. |
| Side Effects | If type=reply: triggers sentiment analysis, flags for admin review. If type=meeting_booked: triggers ACT-08 (Book Meeting). Updates Contact.last_engaged_at. |
| Rollback | Delete engagement record on failure. |

---

#### ACT-08: Book Meeting

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (from Engagement type=meeting_booked) |
| Inputs | workspace_id (String), contact_id (String), scheduled_at (Timestamp), type (Enum), duration_minutes (Integer) |
| Affected Objects | Meeting (CREATE), Pipeline (UPDATE: stage advancement if applicable), AuditEvent (CREATE) |
| Validation | Contact must exist and be active. Scheduled time must be in the future. |
| Side Effects | Creates pre-meeting briefing draft (Meeting Prep App). Triggers calendar invite via connected calendar integration if available. |
| Rollback | Delete created meeting record on failure. |

---

#### ACT-09: Advance Pipeline Stage

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | pipeline_id (String), new_stage (Enum), notes (String, optional) |
| Affected Objects | Pipeline (UPDATE: stage, updated_at), AuditEvent (CREATE) |
| Validation | New stage must be a valid forward or backward movement per defined stage order. Pipeline must be active. |
| Side Effects | Recomputes pipeline velocity (FN-04). Creates AuditEvent with stage transition detail. Updates revenue forecast (FN-12). |
| Rollback | Restore previous stage on failure. |

---

#### ACT-10: Clone Strategy

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | source_strategy_id (String), target_workspace_id (String) |
| Affected Objects | Strategy (CREATE), AuditEvent (CREATE) |
| Validation | Source strategy must be in `complete` status. Target workspace must exist and be active. |
| Side Effects | Creates a new strategy record in target workspace with all section data copied. Sets version=1 on cloned strategy. Does not copy intake data. |
| Rollback | Delete created strategy record on failure. |

---

#### ACT-11: Export Strategy

| Attribute | Detail |
|---|---|
| Trigger | User (admin or client) |
| Inputs | strategy_id (String), format (Enum: pdf / csv / docx) |
| Affected Objects | AuditEvent (CREATE) |
| Validation | Strategy must be in `complete` status. User must have read access to workspace. |
| Side Effects | Generates formatted document. Returns download URL. Logs export event with user ID and timestamp. |
| Rollback | N/A — no data mutation. Log export attempt regardless. |

---

#### ACT-12: Sync to CRM

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (scheduled) |
| Inputs | workspace_id (String), integration_id (String), objects (Array[Enum]: organizations / contacts / pipeline) |
| Affected Objects | Integration (UPDATE: last_sync_at, sync_count), AuditEvent (CREATE) |
| Validation | Integration must be connected and not expired. CRM field mappings must be configured. |
| Side Effects | Upserts Organization, Contact, and Pipeline records into CRM via integration API. Returns sync summary (created, updated, failed counts). |
| Rollback | Log failed records. Do not partial-commit — either full sync succeeds or no changes are written to CRM. |

---

#### ACT-13: Create User Account

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | email (Email), name (String), role (Enum), workspace_id (String, required if role=client), send_invite (Boolean) |
| Affected Objects | User (CREATE), AuditEvent (CREATE) |
| Validation | Email must be unique. Role must be valid. If role=client, workspace must exist. |
| Side Effects | Hashes temporary password. Sends invitation email with login link if send_invite=true. |
| Rollback | Delete created user record on failure. |

---

#### ACT-14: Assign Contact to Sequence

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | contact_id (String), sequence_id (String) |
| Affected Objects | Sequence (UPDATE: contact_count + 1), Message (CREATE, one per step), AuditEvent (CREATE) |
| Validation | Contact must be active and not unsubscribed. Sequence must be in `draft` or `active` status. Contact must not already be enrolled in same sequence. |
| Side Effects | Creates Message draft records for each sequence step personalized to the contact. Computes message quality scores. |
| Rollback | Delete created message records. Decrement sequence.contact_count. |

---

#### ACT-15: Score Lead

| Attribute | Detail |
|---|---|
| Trigger | User (admin) or System (on organization creation or ICP update) |
| Inputs | organization_id (String), workspace_id (String) |
| Affected Objects | Organization (UPDATE: icp_fit_score), AuditEvent (CREATE) |
| Validation | Organization must exist. Workspace must have active intake with ICP defined. |
| Side Effects | Calls FN-01 (ICP Fit Score). Updates Organization.icp_fit_score. Triggers re-sort of organization list by score. |
| Rollback | Restore previous icp_fit_score value. |

---

#### ACT-16: Dismiss Signal

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | signal_id (String), reason (String, optional) |
| Affected Objects | Signal (UPDATE: is_dismissed=true, dismissed_at, dismissed_by), AuditEvent (CREATE) |
| Validation | Signal must exist and not already be dismissed. |
| Side Effects | Removes signal from active feed. Stores in dismissed archive (restorable). |
| Rollback | Restore is_dismissed=false on failure. |

---

#### ACT-17: Archive Workspace

| Attribute | Detail |
|---|---|
| Trigger | User (admin) |
| Inputs | workspace_id (String), reason (String, optional) |
| Affected Objects | Workspace (UPDATE: status=archived), AuditEvent (CREATE) |
| Validation | Workspace must be active. No active pipeline deals in stage before closed_won/closed_lost. Admin must confirm action. |
| Side Effects | Sets all child sequences to `completed`. Retains all data. Removes workspace from active views (but remains searchable in archived filter). |
| Rollback | Restore workspace.status to previous value. |

---

### D.2 Functions

Functions are read-only computations. They derive new information from existing objects and power dashboards, scores, and AI reasoning.

---

#### FN-01: ICP Fit Score

| Attribute | Detail |
|---|---|
| Inputs | Organization, Intake |
| Output | Float (0.0 - 1.0) |
| Logic | Score = weighted sum of: industry match (0.25), employee_count in ICP range (0.20), geography match (0.15), tech_stack overlap (0.20), funding_stage match (0.10), title match in contacts (0.10). Each dimension is binary (1 if match, 0 if not), multiplied by weight, summed. |
| Caching | Cached per (organization_id, intake_id) pair. Invalidated when Intake is updated or Organization properties change. |

---

#### FN-02: Message Quality Score

| Attribute | Detail |
|---|---|
| Inputs | Message, Contact, Intake |
| Output | Float (0-100), String (quality_notes) |
| Logic | AI evaluation prompt assesses: personalization (0-25), relevance to pain points (0-25), CTA clarity (0-20), length appropriateness for channel (0-15), seniority appropriateness (0-15). Scores summed to 100. |
| Caching | Computed on creation. Recomputed if message body is edited. TTL: none (recompute on demand). |

---

#### FN-03: Signal Relevance Score

| Attribute | Detail |
|---|---|
| Inputs | Signal, Intake |
| Output | Float (0.0 - 1.0) |
| Logic | Score = weighted sum of: signal type relevance to ICP (0.30), organization ICP fit if resolved (0.30), keyword overlap between signal headline and intake pain points (0.20), recency decay (0.20, halves every 14 days). |
| Caching | Cached per (signal_id, workspace_id). Invalidated when Intake changes or signal is updated. |

---

#### FN-04: Pipeline Velocity

| Attribute | Detail |
|---|---|
| Inputs | Pipeline (all deals in workspace), AuditEvent (stage transition logs) |
| Output | Float (average days per stage), JSON (per-stage breakdown) |
| Logic | For each stage transition logged in AuditEvent, compute days elapsed. Average across all deals per stage. Weighted by deal value to surface high-value velocity. |
| Caching | Recomputed hourly per workspace. Invalidated on any ACT-09 (Advance Pipeline Stage) call. |

---

#### FN-05: Engagement Rate

| Attribute | Detail |
|---|---|
| Inputs | Sequence, Message (all in sequence), Engagement (all on messages) |
| Output | JSON { sent: Int, opened: Int, replied: Int, meetings_booked: Int, open_rate: Float, reply_rate: Float, meeting_rate: Float } |
| Logic | Count Engagement records by type for all messages in sequence. Divide by total sent count for rates. |
| Caching | Recomputed on each new Engagement record creation. TTL: 5 minutes for dashboard display. |

---

#### FN-06: Workspace Health Score

| Attribute | Detail |
|---|---|
| Inputs | Workspace, Intake, Strategy, Signal, Pipeline, Engagement |
| Output | Float (0-100), JSON (dimension breakdown) |
| Logic | Composite score across six dimensions (weighted): intake completeness (0.20), strategy freshness (0.20), signal activity this week (0.15), pipeline velocity (0.20), engagement rate (0.15), last activity recency (0.10). Each dimension normalized to 0-100, then weighted and summed. |
| Caching | Recomputed daily. Invalidated on any write to Workspace, Strategy, Signal, Pipeline, or Engagement objects. |

---

#### FN-07: Contact Reachability Score

| Attribute | Detail |
|---|---|
| Inputs | Contact, Engagement (history) |
| Output | Float (0.0 - 1.0) |
| Logic | Score based on: email available and not bounced (0.30), LinkedIn URL available (0.25), past positive engagement (0.25), recency of last engagement (0.20, decays over 90 days). Caps at 1.0. |
| Caching | Recomputed when Contact properties change or new Engagement recorded. |

---

#### FN-08: Strategy Freshness

| Attribute | Detail |
|---|---|
| Inputs | Strategy, Intake |
| Output | Integer (days since last generation), Float (freshness score 0-100), Boolean (needs_refresh) |
| Logic | days_since = today - strategy.created_at. freshness_score = max(0, 100 - (days_since * 2)). needs_refresh = true if: days_since > 30, OR intake.updated_at > strategy.created_at (intake changed after generation). |
| Caching | Recomputed daily. Invalidated when Intake is saved. |

---

#### FN-09: Campaign Performance

| Attribute | Detail |
|---|---|
| Inputs | Sequence, Message, Engagement |
| Output | JSON { total_contacts: Int, messages_sent: Int, open_rate: Float, reply_rate: Float, meeting_rate: Float, best_performing_step: Int, best_performing_channel: Enum } |
| Logic | Aggregate FN-05 output per sequence. Identify best step by highest reply rate. Identify best channel by highest reply rate across all contacts. |
| Caching | Recomputed on each new Engagement event. TTL: 10 minutes. |

---

#### FN-10: Objection Frequency

| Attribute | Detail |
|---|---|
| Inputs | Engagement (type=reply, sentiment=negative), Strategy (risk_assessment sections) |
| Output | Array[{ objection: String, count: Int, frequency: Float }] sorted descending |
| Logic | Parse reply bodies for negative sentiment engagements using AI extraction to identify objection categories. Cross-reference with strategy risk_assessment objection list. Count frequency per category. Normalize by total negative replies. |
| Caching | Recomputed weekly per workspace. TTL: 24 hours for display. |

---

#### FN-11: Best Performing Angle

| Attribute | Detail |
|---|---|
| Inputs | Message (with angle field), Engagement (reply and meeting_booked events) |
| Output | Array[{ angle: String, reply_rate: Float, meeting_rate: Float, message_count: Int }] sorted by reply_rate descending |
| Logic | Group messages by angle. Compute reply_rate = replies / sent and meeting_rate = meetings / sent per angle. Return sorted list. Minimum 5 messages per angle for statistical relevance. |
| Caching | Recomputed weekly. Invalidated when significant new Engagement data arrives (>10 new records). |

---

#### FN-12: Revenue Forecast

| Attribute | Detail |
|---|---|
| Inputs | Pipeline (all active deals in workspace) |
| Output | JSON { total_pipeline: Float, weighted_forecast: Float, forecast_by_month: Array[{ month: String, value: Float }] } |
| Logic | weighted_forecast = SUM(deal.value_usd * deal.probability) across all active deals. forecast_by_month groups by expected_close_date month and sums weighted values. |
| Caching | Recomputed on any Pipeline update. TTL: 1 hour for dashboard. |

---

#### FN-13: Team Utilization

| Attribute | Detail |
|---|---|
| Inputs | Message (sent, with actor from AuditEvent), Team |
| Output | JSON { messages_per_user_per_day: Float, most_active_user: String, activity_by_day: Array[{ date: Date, count: Int }] } |
| Logic | Count messages with status=sent per user per day over rolling 30 days. Compute average. Identify top sender. |
| Caching | Recomputed daily. |

---

#### FN-14: Signal Trend

| Attribute | Detail |
|---|---|
| Inputs | Signal (with type and detected_at), Workspace |
| Output | JSON { by_type: Array[{ type: Enum, counts: Array[Int], trend: Enum (rising/stable/falling) }], total_by_week: Array[{ week: String, count: Int }] } |
| Logic | Group signals by type and detected_at week. Compute weekly counts per type. Determine trend by comparing last 2 weeks vs. prior 2 weeks: rising = >20% increase, falling = >20% decrease, stable = otherwise. |
| Caching | Recomputed daily. TTL: 6 hours for dashboard. |

---

#### FN-15: Account Prioritization

| Attribute | Detail |
|---|---|
| Inputs | Organization, Signal, Pipeline, Engagement, Intake |
| Output | Array[{ organization_id: String, priority_score: Float, rank: Int, drivers: Array[String] }] sorted descending |
| Logic | Composite score per organization: ICP fit score FN-01 (0.30) + recent signal urgency FN-03 (0.25) + pipeline deal presence (0.20, 1.0 if active deal) + contact reachability FN-07 (0.15) + recency of last engagement (0.10). Drivers list top 3 contributing factors. |
| Caching | Recomputed daily and on any new Signal or Engagement for the organization. |

---

## Section E: Implementation Plan

### E.1 Current Stack Assessment

| Component | Current State | Limitation | Migration Priority |
|---|---|---|---|
| Frontend | React 18 UMD, 3,864 lines, single HTML file, in-browser Babel | No build pipeline, no code splitting, growing file size | High — Sprint 1 |
| Backend | Single Node.js serverless function, 499 lines | 10s timeout ceiling, no horizontal scaling, no background jobs | Critical — Sprint 1 |
| Database | Neon PostgreSQL, 7 tables, JSON string storage | No normalized querying, no RLS, no audit trail | Critical — Sprint 1 |
| Auth | SHA-256 + in-memory sessions + query param tokens | Not production-grade; not safe for multi-tenant SaaS | Critical — Sprint 1 |
| AI | Anthropic + OpenAI APIs, retry logic | Cost not metered, no usage tracking per workspace | Medium — Sprint 2 |
| Hosting | Vercel Hobby | 10s function timeout, limited function count | High — Sprint 1 (upgrade to Pro) |
| Routing | No URL routing | Cannot deep-link, cannot share URLs | Medium — Sprint 2 |

---

### E.2 Recommended Migration Path

**Target Stack: Supabase + Next.js App Router + Vercel Pro**

| Layer | Current | Target | Rationale |
|---|---|---|---|
| Auth | Custom SHA-256 + sessions | Supabase Auth (bcrypt, JWT, Google OAuth provider) | Production-grade, maintained, RLS-integrated |
| Database | Neon PostgreSQL (JSON strings) | Supabase Postgres (normalized, RLS policies) | Row-level security, real-time, normalized schema |
| Backend | Single Vercel serverless function | Next.js App Router API routes + Supabase Edge Functions | Eliminates 10s ceiling, enables background jobs |
| Real-time | None | Supabase Realtime (websocket subscriptions) | Live feed updates, collaborative editing |
| Frontend | React 18 UMD + single HTML | Next.js App Router (React 18, SSR/SSG, code splitting) | Build pipeline, lazy loading, URL routing |
| File storage | None | Supabase Storage | Document attachments, PDF exports |
| Hosting | Vercel Hobby | Vercel Pro | Longer timeouts (300s), more functions, analytics |

**Migration Principles**

1. Additive only. Every feature currently working must continue to work throughout migration.
2. Database-first. Schema normalization happens in Sprint 1 before any new application layer is built.
3. Parallel operation. The existing Vercel function continues to serve requests while the Next.js migration is in progress. A feature flag controls which handler processes each route.
4. Data integrity. All existing workspace, intake, strategy, and intelligence data migrates via a one-time ETL script. No data loss.
5. Auth handoff. Session tokens are invalidated on cutover day. All users re-authenticate against Supabase Auth. A migration email is sent in advance.

---

### E.3 90-Day Sprint Plan

#### Sprint 1 (Days 1-30): Foundation Migration

**Goal:** Replace the scaffolding beneath the working building without collapsing the floors above. Every user-facing feature must work on day 30 as well as it works on day 0.

**Deliverables**

| # | Deliverable | Description |
|---|---|---|
| 1.1 | Supabase project setup | Create Supabase project, configure environment variables, enable required extensions (uuid-ossp, pg_trgm) |
| 1.2 | Normalized schema migration | Convert all 7 tables to normalized schema matching ontology. JSON blobs become typed columns. |
| 1.3 | RLS policies | Row-level security on all tables: admins see all rows; clients see only their workspace_id. |
| 1.4 | ETL migration script | One-time script to migrate all data from Neon to Supabase Postgres. Validate row counts and spot-check strategy JSON. |
| 1.5 | Supabase Auth integration | Migrate password hashing to Supabase Auth (bcrypt). Migrate Google OAuth. Issue JWTs. Implement HttpOnly cookies. |
| 1.6 | Forgot Password flow | Supabase Auth password reset via email. Resolves known gap #4. |
| 1.7 | Next.js project scaffolding | Initialize Next.js App Router project. Set up Tailwind CSS, DM Sans/JetBrains Mono fonts, theme tokens (#1C3C34). |
| 1.8 | Migrate core components | Port design system (Icon, Btn, Input, Select, Card, Badge, Field, Skeleton, Toast) to Next.js components. |
| 1.9 | Migrate Auth views | Port LoginScreen to Next.js with Supabase Auth. |
| 1.10 | Migrate Admin views | Port WorkspacesView, WorkspaceDetail, ManageAccountsInline. |
| 1.11 | Migrate Intake + Strategy | Port IntakeForm and StrategyView (all 11 tabs) as functional parity. Zero regression. |
| 1.12 | Migrate Intelligence Feed | Port IntelligenceFeed, MarketPulse, SignalCard. |
| 1.13 | Fix intake_count increment | Fix known gap #2: increment on every intake save. |
| 1.14 | Enforce unique workspace names | Fix known gap #3: unique constraint + UI validation. |
| 1.15 | Vercel Pro upgrade | Upgrade plan. Configure longer timeouts for AI routes (up to 300s). |
| 1.16 | CI/CD pipeline | GitHub Actions: lint, test, preview deploy on PR, auto-deploy to production on main merge. |

**Database Migration (Conceptual DDL)**

```sql
-- AuditEvent table (immutable)
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY DEFAULT 'audit_' || gen_random_uuid(),
  actor_user_id TEXT REFERENCES auth.users(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  workspace_id TEXT REFERENCES workspaces(id),
  metadata JSONB,
  ip_address TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalized signals table (replaces JSON array in intelligence_data)
CREATE TABLE signals (
  id TEXT PRIMARY KEY DEFAULT 'signal_' || gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT REFERENCES organizations(id),
  type TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  source_name TEXT,
  urgency TEXT NOT NULL DEFAULT 'medium',
  relevance_score FLOAT DEFAULT 0,
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT REFERENCES auth.users(id),
  draft_message_id TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations table (new)
CREATE TABLE organizations (
  id TEXT PRIMARY KEY DEFAULT 'org_' || gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employee_count INTEGER,
  employee_range TEXT,
  revenue_range TEXT,
  tech_stack TEXT[],
  funding_stage TEXT,
  founded_year INTEGER,
  headquarters_city TEXT,
  headquarters_country TEXT,
  linkedin_url TEXT,
  website TEXT,
  description TEXT,
  icp_fit_score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS Policy Pattern**

```sql
-- Admins see all workspaces; clients see only their own
CREATE POLICY workspace_isolation ON workspaces
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ridge_admin'
    OR id = (SELECT workspace_id FROM users WHERE id = auth.uid())
  );
```

**Success Criteria**

- All existing functionality works on new stack with zero regression
- Strategy generation completes within 60s (Vercel Pro timeout lifted)
- All data migrated from Neon to Supabase with 100% row count match
- Auth migration complete; all sessions use JWTs via HttpOnly cookies
- CI/CD pipeline deploys in under 3 minutes on every main merge
- Forgot Password flow functional end-to-end

---

#### Sprint 2 (Days 31-60): Application Layer

**Goal:** Build the new applications that turn Ridge from a strategy tool into a full-cycle sales intelligence platform.

**Deliverables**

| # | Deliverable | Description |
|---|---|---|
| 2.1 | URL routing | Implement Next.js App Router URL structure: /workspaces, /workspaces/[id], /workspaces/[id]/strategy, etc. Resolves known gap #1. |
| 2.2 | Sequence Builder | Full Sequence Builder application: visual step canvas, channel selector, contact enrollment. |
| 2.3 | Message Studio | AI message composition, quality scoring (FN-02), seniority policy selector, A/B variants. |
| 2.4 | Pipeline Tracker | Kanban board, deal creation, stage advancement (ACT-09), revenue forecast (FN-12). |
| 2.5 | Analytics Hub | Cross-workspace engagement, signal, and pipeline dashboards. |
| 2.6 | Supabase Realtime | Live updates on intelligence feed (new signals appear without refresh). |
| 2.7 | Pagination | Paginate workspaces, signals, messages, engagements. Resolves known gap #6. |
| 2.8 | File attachments | Supabase Storage integration. Attach documents to workspaces and meetings. Resolves known gap #11. |
| 2.9 | Audit Log | AuditEvent table fully populated. Admin Console audit log view with search and filter. Resolves known gap #10. |
| 2.10 | Playbook Library (v1) | Save strategy sections as playbooks. Browse and filter library. Apply to new workspace. |
| 2.11 | Client Portal expansion | Add Pipeline and Meeting History views to ClientPortal. |
| 2.12 | Webhook infrastructure | Inbound webhooks for engagement tracking (email opens, clicks). Resolves known gap #9. |
| 2.13 | Meeting Prep (v1) | Pre-meeting briefing generator. Post-meeting capture form with notes import. |

**API Endpoints to Build (Sprint 2)**

| Method | Route | Description |
|---|---|---|
| GET/POST | /api/sequences | Sequence CRUD |
| GET/PUT/DELETE | /api/sequences/[id] | Sequence detail |
| GET/POST | /api/sequences/[id]/messages | Messages in sequence |
| POST | /api/sequences/[id]/enroll | Enroll contact in sequence |
| GET/POST | /api/messages | Message CRUD |
| POST | /api/messages/[id]/score | Compute quality score |
| GET/POST | /api/pipeline | Pipeline CRUD |
| PUT | /api/pipeline/[id]/advance | Advance stage |
| GET | /api/analytics/overview | Platform overview metrics |
| GET | /api/analytics/engagement | Engagement rate data |
| POST | /api/webhooks/engagement | Inbound engagement events |
| GET/POST | /api/playbooks | Playbook CRUD |
| GET/POST | /api/meetings | Meeting CRUD |
| POST | /api/meetings/[id]/briefing | Generate pre-meeting briefing |

**Success Criteria**

- Sequence Builder allows creation of 5-step sequence in under 10 minutes
- Message quality scores computed for all AI-generated messages
- Pipeline Kanban renders with all active deals; stage advancement works
- Real-time signal feed updates without page refresh
- Audit log captures all ACT-01 through ACT-17 actions
- URL routing works: all views have bookmarkable deep-link URLs

---

#### Sprint 3 (Days 61-90): Intelligence, Integrations, and Polish

**Goal:** Complete the platform with CRM integrations, export capabilities, automated intelligence, and production security hardening.

**Deliverables**

| # | Deliverable | Description |
|---|---|---|
| 3.1 | Automated signal scanning | Scheduled daily signal scan (Supabase Edge Function cron). Workspace-specific scan configuration. |
| 3.2 | Signal Intelligence enhancements | Signal trend chart (FN-14), organization context panel in signal drawer, account prioritization list (FN-15). |
| 3.3 | HubSpot integration | OAuth connection. Sync Organizations, Contacts, Pipeline stages to HubSpot deals. (ACT-12) |
| 3.4 | Salesforce integration | OAuth connection. Sync to Salesforce Accounts, Contacts, Opportunities. (ACT-12) |
| 3.5 | Strategy export (PDF) | PDF export of full strategy (ACT-11). |
| 3.6 | Strategy export (CSV) | CSV export of ICP criteria, contact criteria, and Sales Nav strings. Resolves known gap #5. |
| 3.7 | Meeting Prep (v2) | Circleback/Granola/Fathom/Otter notes auto-import post-meeting. Meeting history by organization. |
| 3.8 | Performance optimization | Code splitting, lazy loading, image optimization, Lighthouse score target >90. |
| 3.9 | Security audit | Penetration testing of auth, RLS policies, API authorization. Resolve API key hardcoding. Add rate limiting. |
| 3.10 | Password security | Confirm bcrypt migration complete. Verify no SHA-256 hashing remains. |
| 3.11 | Rate limiting | API rate limiting on all routes. DDoS mitigation. Resolves known gap (security). |
| 3.12 | Encryption at rest | Enable Supabase column-level encryption for credentials, intake PII. |
| 3.13 | Analytics Hub v2 | Message quality histograms, objection frequency (FN-10), best performing angle (FN-11). |
| 3.14 | Pricing/billing hooks | Usage metering infrastructure: count strategy runs, signals scanned, messages drafted per workspace. (Preparation for billing — does not require Stripe in Sprint 3.) |
| 3.15 | Admin Console v2 | Team management, integration panel, platform settings (AI model preferences, usage limits). |

**Success Criteria**

- Automated signal scanning runs daily with zero manual triggers
- HubSpot and Salesforce integrations sync bidirectionally with <5% error rate
- Strategy PDF export renders all 11 sections with Ridge branding
- Lighthouse performance score >90 on all major views
- Security audit: zero critical findings remaining
- Rate limiting active on all public-facing API routes
- Usage metering data available for all billable operations

---

## Section F: IP and Moat Analysis

### F.1 Competitive Landscape

| Competitor | Category | Scale | Key Strength | Ridge vs. Competitor |
|---|---|---|---|---|
| Apollo.io | Contact data + engagement | 275M+ contacts, $100M+ ARR | Database breadth, contact enrichment | Ridge has strategy layer Apollo lacks entirely; Ridge's intelligence is context-aware not just data-lookup |
| Outreach | Sales engagement / sequencing | $200M+ ARR | Sequencing depth, CRM integration | Ridge is AI-strategy-first; Outreach has no intake-to-strategy-to-sequence pipeline |
| Salesloft | Revenue engagement (Vista Equity) | Enterprise segment | Call analytics, coaching | Ridge serves SMB/mid-market with client portal model; Salesloft is enterprise-only |
| Gong | Revenue intelligence (call recording) | $250M+ ARR | Conversation intelligence | Ridge adds pre-call strategy layer; Gong is post-call analytics only |
| Clari | Revenue operations / forecasting | Enterprise | Pipeline forecasting | Ridge's pipeline is engagement-connected; Clari is CRM-data-dependent |
| Clay | Data enrichment + workflow automation | $50M+ ARR | Waterfall enrichment, API breadth | Ridge is strategy-native; Clay is data-plumbing. Ridge uses Clay as an integration partner, not a competitor |
| Instantly.ai | Email automation / deliverability | High volume senders | Email infrastructure, deliverability | Ridge does not compete on volume email; Ridge competes on strategic, targeted engagement |

**Positioning Summary**

Ridge's unique position: the only platform that starts with a structured client intake, generates an AI-native go-to-market strategy, and connects that strategy directly to signal detection and engagement execution — in a single, integrated workflow. No competitor owns all three layers.

---

### F.2 Ridge's Defensible Differentiators

**1. Ontology-First Architecture**

Competitors are feature-first — they build capabilities independently and then try to integrate them. Ridge's ontology-first architecture means that Organization, Contact, Signal, Strategy, and Message objects share a semantic layer from the start. This enables cross-object intelligence (ICP fit scores, account prioritization, signal-to-action pipeline) that point solutions cannot replicate without a multi-year re-architecture.

**2. AI-Native Strategy Generation**

Apollo finds contacts. Gong records calls. Neither generates a go-to-market strategy. Ridge's parallel dual-API strategy generation produces a client-specific, eleven-section strategy from a structured intake in under two minutes. This is not prompt wrapping — the parallel dispatch, JSON repair pipeline, and structured merge logic constitute a proprietary generation architecture.

**3. Signal-to-Action Pipeline**

Ridge is the only platform where a detected funding signal can automatically produce a relevance-scored alert, a drafted outreach message incorporating the signal context, and a sequenced follow-up plan — all within the same platform and all grounded in the client's pre-computed strategy. This is the intelligence-to-execution flywheel competitors cannot easily replicate.

**4. Client Portal Model**

The client portal creates a delivery channel that no data vendor or sequencing tool offers. Ridge can operate as an AI-powered services layer — clients get a white-label portal with their strategy, signals, and pipeline. This enables Ridge to sell to agencies, fractional sales leaders, and GTM consultants who deliver Ridge's output to their own clients, creating a distribution multiplier.

**5. Integrated Playbook System**

As Ridge accumulates strategy data across workspaces, the Playbook Library becomes a proprietary knowledge asset. No competitor has a structured, performance-tracked playbook system that learns from live engagement data. This is the beginning of a data network effect: each new workspace improves the playbook library for all future workspaces.

---

### F.3 Patent Invention Disclosures

---

#### Patent Disclosure 01: Method for Parallel Dual-API Strategy Generation with Robust JSON Repair

**Title:** Method for Parallel Dual-API Strategy Generation with Robust JSON Repair in AI-Assisted Sales Strategy Systems

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional — file before public demonstration or commercial deployment

**Technical Description**

This invention describes a system and method for generating multi-section AI sales strategies by dispatching two simultaneous, complementary AI model calls that each produce one half of a unified strategy document. The first call (Part A: Research and Targeting) generates the ICP, decision-maker profile, channel analysis, and value proposition sections. The second call (Part B: Execution and Messaging) generates the messaging framework, meeting structure, pipeline sequence, follow-up cadence, and executive summary. Both calls are dispatched in parallel (Promise.all pattern) and their outputs are merged at the JSON level after individual resolution.

The invention further describes a nine-stage JSON repair pipeline that processes each model output before merge. The stages are, in order: (1) code fence stripping, (2) brace extraction to isolate the outermost JSON object, (3) smart quote normalization (replacing Unicode curly quotes with ASCII), (4) direct parse attempt, (5) trailing comma removal, (6) newline character repair within string values, (7) escape sequence normalization, (8) truncation recovery (appending missing closing braces for partial outputs), (9) backward-walk parse (attempting parse at progressively shorter string lengths to recover partial valid JSON). This repair pipeline ensures that malformed or partially truncated LLM outputs are recovered without requiring a full retry, which preserves the time and cost savings of the parallel dispatch.

The merged strategy object contains all eleven sections, each with structured sub-fields defined by a schema enforced at the merge stage. The system selects AI models per call from a configurable preference list (Claude Sonnet 4.5 primary, Claude Haiku fallback, GPT-4o fallback) and logs model selection per call for auditability.

**Novel Claims**

1. A method of generating a multi-section AI-assisted sales strategy document comprising: dispatching a first AI model call to generate a first subset of strategy sections; dispatching a second AI model call concurrently to generate a second subset of strategy sections; applying a multi-stage JSON repair pipeline to each model output; and merging the repaired outputs into a unified strategy document.

2. The method of claim 1, wherein the multi-stage JSON repair pipeline comprises at least nine distinct repair stages applied sequentially, including a backward-walk parse stage that attempts to recover a valid JSON object from a truncated output by incrementally reducing the input length.

3. A system for parallel AI strategy generation wherein the model selection for each of the two concurrent calls is independently configurable and falls back through a defined preference chain on API error or rate limit, such that the system degrades gracefully to single-model sequential generation rather than failing entirely.

4. The method of claim 1, wherein the merge operation applies a section-level conflict resolution policy that preserves the more complete of the two sections in the event of duplication at a section key.

5. A computer-readable medium storing instructions for a nine-stage JSON repair pipeline wherein stage eight applies a truncation recovery heuristic that appends the minimum number of closing brace characters required to balance the JSON structure of a partially truncated string.

**Prior Art Differentiation**

Existing LLM orchestration frameworks (LangChain, LlamaIndex) support chained sequential calls but do not describe parallel dual-dispatch with section-complementary partitioning. OpenAI and Anthropic function calling systems describe structured output generation but do not address multi-stage repair for malformed JSON. No prior art describes the combination of parallel complementary dispatch, nine-stage repair, and section-level merge for multi-part document generation in a sales strategy context.

---

#### Patent Disclosure 02: System for Ontology-Augmented Sales Intelligence with Signal-to-Outreach Pipeline

**Title:** System for Ontology-Augmented Sales Intelligence with Automated Signal-to-Outreach Pipeline Generation

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional

**Technical Description**

This invention describes an integrated system in which real-time market signals — including funding events, hiring activity, leadership changes, product launches, and other defined event types — are automatically correlated with a stored client ICP ontology to produce relevance-scored intelligence records. Each signal is scored against the client's intake-defined ICP (industry, company size, geography, seniority, and technology stack dimensions) using a weighted multi-dimensional scoring function. The resulting relevance score determines the signal's urgency tier and its position in the client's intelligence feed.

The system further describes a downstream outreach generation pipeline that receives a relevance-scored signal as input and produces a contextually grounded outreach draft. The outreach draft incorporates: (a) the signal headline and summary as primary context, (b) the client's pre-computed messaging strategy (from a prior strategy generation run) as framing, (c) the target contact's seniority level as a constraint on message tone and CTA style. This three-part context composition is novel in that it combines real-time external intelligence with pre-computed strategic intelligence and contact-level targeting constraints in a single generation prompt.

The system maintains a bidirectional link between each generated outreach draft and its originating signal, enabling engagement analytics to be attributed to the signal that triggered them, which in turn enables the system to learn which signal types produce the highest-quality outreach responses over time.

**Novel Claims**

1. A system for generating relevance-scored sales intelligence comprising: a signal ingestion component that classifies external events into a defined set of signal types; a scoring component that computes a relevance score for each signal against a client ICP ontology; and a feed component that presents signals ordered by relevance score and urgency tier.

2. The system of claim 1, further comprising an outreach generation component that receives a signal record, a client strategy record, and a contact seniority level, and produces an outreach draft message incorporating all three inputs as generation context.

3. A method for bidirectional attribution of engagement outcomes to originating signals, comprising: storing a foreign key from each outreach draft to its source signal; recording engagement events (open, reply, meeting booked) on each draft; and aggregating engagement rates by source signal type to produce signal-type performance analytics.

4. The system of claim 1, wherein the ICP ontology is defined by a structured intake object comprising at minimum: target industry list, target company size range, target geography list, target decision-maker title list, and pain points, and wherein the relevance scoring function applies configurable weights to each dimension.

5. A computer-implemented method for generating seniority-aware outreach from signal context, wherein the generation prompt incorporates a seniority targeting policy that dynamically adjusts tone, length, and call-to-action style based on the target contact's organizational level.

**Prior Art Differentiation**

Existing sales intelligence platforms (Apollo, ZoomInfo) provide signal data but do not connect signals to a client-specific ICP ontology for relevance scoring, nor do they generate contextually grounded outreach that incorporates the signal as primary context. Gong analyzes calls post-hoc but does not operate on external market signals. No prior art describes the complete pipeline from signal ingestion through ICP relevance scoring through strategy-informed, seniority-aware outreach generation.

---

#### Patent Disclosure 03: Method for Website-to-Intake Automated Client Profiling Using Web Search and LLM Extraction

**Title:** Method for Single-Pass Website-to-Structured-Intake Automated Client Profiling Using Web Search with LLM Extraction and Selective Merge

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional

**Technical Description**

This invention describes a single-pass automated profiling method that accepts a company URL as its sole input and produces a structured business intake record suitable for AI strategy generation. The method operates in two stages. In the first stage, a web search query is constructed from the domain name and submitted to a search-enabled AI model (specifically using GPT-4o-search-preview or equivalent web-search-augmented model) to retrieve current, publicly available information about the company. In the second stage, the retrieved information is passed to an instruction-following LLM with a schema extraction prompt that maps the unstructured web content to a predefined business profile schema comprising: company description, primary offer, offer type, target customer profile (ICP), value propositions, known pain points, competitive alternatives, and constraints.

The invention further describes a selective merge algorithm that governs how extracted values are applied to an existing intake record. The merge policy is: extracted values are written only to fields that are currently empty or contain only placeholder text; fields that contain user-authored content are not overwritten. This selective merge policy is critical for preserving user edits when re-scanning a URL after manual changes have been made to the intake form. The merge is applied at the field level, not the record level, meaning a partial re-scan updates only the empty fields without touching populated ones.

**Novel Claims**

1. A method for automated client profiling comprising: receiving a company URL; constructing and submitting a web search query derived from the URL domain; receiving search results from a web-search-augmented language model; submitting the search results and a schema extraction prompt to a language model; and writing the extracted structured data to a business intake record.

2. The method of claim 1, wherein the schema extraction prompt defines a target intake schema comprising at minimum eight structured fields covering company identity, product offer, ideal customer profile, value propositions, and pain points.

3. A selective merge algorithm for combining AI-extracted intake data with user-authored intake data, comprising: comparing each extracted field value against the corresponding field in an existing intake record; writing the extracted value only if the existing field is empty or contains a recognized placeholder string; and preserving user-authored content without modification.

4. The method of claim 1, wherein a primary web-search-augmented model is used with a fallback to a secondary search model upon API error, ensuring the profiling operation succeeds across provider availability events.

5. A system implementing the method of claims 1-4, wherein the schema extraction prompt is versioned and stored separately from the application code, enabling schema updates without code deployment.

**Prior Art Differentiation**

Existing company data enrichment tools (Clearbit, Apollo enrichment) retrieve structured data from proprietary databases, not via real-time web search. They do not perform LLM-based schema extraction from unstructured web content. Web scraping solutions extract raw content but do not apply structured schema mapping or selective merge logic. No prior art describes the combination of real-time web search, LLM schema extraction, and selective field-level merge for automated sales intake profiling.

---

#### Patent Disclosure 04: Apparatus for Multi-Source Meeting Note Extraction and Structured Business Intelligence Mapping

**Title:** Apparatus for Multi-Source AI Notetaker Integration with Source-Aware Extraction and Structured Business Schema Mapping

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional

**Technical Description**

This invention describes an apparatus for accepting unstructured meeting transcripts and summaries from multiple AI notetaker platforms — including Circleback, Granola, Fathom, and Otter.ai — and extracting structured client business intelligence that maps directly to a predefined intake schema. The apparatus operates with source-awareness: it identifies the originating notetaker platform from the text structure, formatting conventions, and metadata present in the pasted content, and applies a source-specific extraction strategy optimized for that platform's output format.

Each AI notetaker platform produces output in a distinct format. Circleback produces bulleted action items and a narrative summary. Granola produces a structured document with labeled sections. Fathom produces timestamped highlights with speaker attribution. Otter produces full transcripts with speaker turns. The apparatus recognizes these format signatures and routes the extraction request to the appropriate parsing prompt, which is optimized for each format's structure.

The extracted data is then mapped to the intake schema fields (company description, offer, ICP, pain points, value propositions, constraints, objections) using a structured LLM extraction prompt. The mapping handles partial extraction gracefully — fields for which no information was discussed in the meeting are left empty rather than hallucinated. A confidence indicator is attached to each extracted field indicating whether the value was explicitly stated versus inferred.

**Novel Claims**

1. An apparatus for meeting note processing comprising: a format detection component that identifies the originating AI notetaker platform from the structural and formatting characteristics of pasted text; a source-specific extraction component that applies an extraction prompt optimized for the identified platform's output format; and a schema mapping component that produces a structured intake record from the extracted content.

2. The apparatus of claim 1, wherein the format detection component identifies at least four distinct notetaker platforms from text signatures without requiring user selection of the source.

3. A method for confidence-annotated meeting note extraction wherein each extracted field in the output schema is accompanied by a confidence indicator distinguishing between explicitly stated values and inferred values.

4. The apparatus of claim 1, wherein the schema mapping component applies a null-preservation policy that leaves fields empty when no relevant information was discussed in the meeting, rather than generating hallucinated placeholder values.

5. A computer-readable medium storing a set of source-specific extraction prompts, one per supported notetaker platform, each optimized for that platform's output structure and designed to maximize extraction completeness for its format.

**Prior Art Differentiation**

CRM note import tools (Salesforce, HubSpot) accept free-form notes but do not perform structured schema extraction or source-aware parsing. Zapier/Make notetaker integrations pass raw transcript data without mapping to a business schema. No prior art describes source-aware extraction from multiple AI notetaker platforms with schema-mapped output and confidence annotation.

---

#### Patent Disclosure 05: Method for Quality-Scored Messaging with Seniority-Aware Targeting Policy

**Title:** Method for AI-Assisted Sales Message Generation with Multi-Dimensional Quality Scoring and Configurable Seniority-Aware Targeting Constraints

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional

**Technical Description**

This invention describes a system and method for generating outreach messages in which each generated message is accompanied by a numerical quality score (0-100) and a set of quality notes providing specific, actionable improvement feedback. The quality scoring evaluates the message across five independent dimensions: personalization (relevance to the specific recipient and their context), pain point relevance (alignment with the target's known pain points from the intake schema), CTA clarity (specificity and actionability of the call to action), channel appropriateness (length, formality, and format for the delivery channel), and seniority appropriateness (alignment with the organizational level of the target).

The system further describes a seniority-aware targeting policy mechanism. Before message generation, the user or system selects a targeting policy from a configurable set (e.g., IC, Director+, VP+, C-Suite Only, Founder). The selected policy is injected into the generation prompt as a constraint set that governs: maximum message length, tone register (conversational to formal), CTA style (meeting request vs. value statement vs. question), and which messaging angles are appropriate for the seniority level. The policy ensures that a C-Suite targeted message is materially different from an IC targeted message even when both are generated from the same intake and signal context.

The quality score and quality notes are generated in the same inference call as the message itself, using a structured output format that returns the message body, score (Integer 0-100), and notes (String) in a single JSON response. This co-generation approach ensures that the quality evaluation is performed by the same model with the same context as the generation itself, producing more relevant and accurate quality feedback than a separate evaluation call.

**Novel Claims**

1. A method for AI-assisted message generation comprising: receiving a target contact record with seniority level; selecting a seniority targeting policy from a configurable policy set; incorporating the policy as generation constraints into an inference prompt; and generating a message body, quality score, and quality notes in a single inference call.

2. The method of claim 1, wherein the quality score is computed across five independent dimensions — personalization, pain point relevance, CTA clarity, channel appropriateness, and seniority appropriateness — and the quality notes provide dimension-specific feedback for each dimension scoring below a threshold.

3. A configurable seniority targeting policy system comprising at minimum four distinct policy levels, wherein each policy defines: maximum character count, tone register, CTA style, and permitted messaging angles, and wherein the policy constraints are injected into the generation prompt as explicit instructions.

4. The method of claim 1, wherein quality score and quality notes are co-generated with the message body in a single structured output call, such that the evaluating model has access to the full generation context including intake, strategy, signal, and contact data.

5. A method for A/B message variant generation wherein two messages are generated with identical context but independent random seed parameters, each scored independently, with the scores surfaced to the user for variant selection.

**Prior Art Differentiation**

Email writing assistants (Lavender, Regie.ai) provide quality scoring but do not integrate seniority-aware policy constraints or ground scoring in client-specific intake and strategy context. No prior art describes co-generation of message and quality score in a single structured output call grounded in a multi-dimensional schema. Existing tools score messages in isolation; Ridge's scoring is contextually grounded in the specific client, target, and strategy.

---

#### Patent Disclosure 06: System for Dynamic Campaign Risk Modeling with Automated Week-Over-Week Adjustment Recommendations

**Title:** System for AI-Generated Campaign Risk Assessment with Automated Engagement-Responsive Week-Over-Week Adjustment Recommendations

**Inventors:** Owen [Ridge], Ridge Engineering Team

**Filing Priority:** Provisional

**Technical Description**

This invention describes a system for generating campaign risk assessments that are dynamically updated based on observed engagement metrics. The initial risk model is generated from the client's structured intake profile using an LLM, and comprises: a set of likely objections with pre-computed response angles for each, a set of success signal definitions (specific observable events that indicate the campaign is working), a set of failure signal definitions (specific events that indicate underperformance), and week-specific adjustment recommendations (week 1: establish context; week 2: address expected objections; week 3+: pivot based on observed signals).

The system further describes an engagement-responsive update mechanism. As engagement data accumulates (reply rates, objection patterns, meeting booking rates), the system compares observed metrics against the pre-defined success and failure signal definitions. When a failure signal threshold is crossed (e.g., reply rate falls below the defined failure benchmark by end of week 2), the system automatically generates a new adjustment recommendation incorporating the observed data. This creates a closed-loop risk management system in which the initial static risk model evolves into a dynamic, evidence-based adjustment guide.

The risk model is generated as part of the overall strategy generation process (the RiskTab in the strategy view) and is subsequently updated independently as engagement data accrues, without requiring a full strategy regeneration. The update cycle runs weekly and produces a delta report showing which risk indicators have changed status and what specific tactical adjustments are recommended.

**Novel Claims**

1. A system for campaign risk modeling comprising: a risk model generator that produces an initial risk assessment from a structured intake profile, comprising objections with response angles, success signal definitions, failure signal definitions, and week-specific adjustment recommendations; and an engagement-responsive update component that revises the adjustment recommendations based on observed engagement metrics.

2. The method of claim 1, wherein success and failure signals are defined as specific, measurable engagement thresholds (e.g., reply rate, meeting booked rate) during the initial risk model generation, and subsequent observed metrics are compared against these thresholds to determine risk status.

3. A system for automated week-over-week campaign adjustment generation wherein the adjustment recommendations are generated independently of the full strategy, enabling tactical updates without requiring a complete strategy regeneration.

4. The method of claim 1, wherein the engagement-responsive update component produces a delta report identifying which risk indicators have transitioned between defined states (green/yellow/red) and generating specific, actionable recommendations for each transition.

5. A computer-implemented method for objection-response angle pre-computation wherein, at risk model generation time, each anticipated objection is accompanied by a pre-computed response angle that can be surfaced to the user at the moment the objection is observed in a reply engagement, without requiring a real-time inference call.

**Prior Art Differentiation**

Sales engagement platforms (Outreach, Salesloft) provide sequence analytics but do not generate pre-computed risk models or closed-loop adjustment recommendations. A/B testing frameworks in email platforms operate on message-level variables but do not model campaign-level risk with objection-anticipation and success/failure signal definitions. No prior art describes the combination of AI-generated initial risk models with engagement-responsive week-over-week updates and pre-computed objection response angles in a sales campaign context.

---

## Section G: Risks, Open Questions, and Kill Criteria

### G.1 Technical Risks

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| TR-01 | Vercel Hobby 10s timeout limits AI operations | Critical | Certain (already occurring) | Upgrade to Vercel Pro in Sprint 1. Strategy generation has failed silently when Sonnet calls run long. This is the most urgent technical risk. |
| TR-02 | Single serverless function is scaling bottleneck | High | Certain at growth | Sprint 1 migration to Next.js App Router distributes routes across multiple functions. No single timeout ceiling. |
| TR-03 | JSON string storage prevents efficient cross-workspace querying | High | Certain at analytics scale | Sprint 1 schema normalization converts all JSON blobs to typed columns. Analytics Hub in Sprint 2 depends on this. |
| TR-04 | No data backup or disaster recovery | High | Medium | Supabase daily backups (Point-in-time recovery) activated in Sprint 1 setup. Define RPO (1 hour) and RTO (4 hours) targets. |
| TR-05 | API keys in source code (base64-encoded OpenAI key) | Critical | Known | Migrate all secrets to Vercel environment variables and Supabase Vault immediately. Rotate all exposed keys. |
| TR-06 | No rate limiting on API endpoints | High | Medium | Implement Vercel Edge Middleware rate limiting in Sprint 1. Prioritize auth routes and AI routes. |
| TR-07 | SHA-256 password hashing | High | Known | Supabase Auth migration in Sprint 1 resolves entirely. |
| TR-08 | No multi-tenant RLS beyond workspace_id FK | High | Known | Supabase RLS policies in Sprint 1. Every table gets a policy before any new data is written. |
| TR-09 | AI provider rate limits at scale (Anthropic 429s) | Medium | Medium at growth | Current retry logic (1 retry, 5s) is adequate for low volume. At scale, implement exponential backoff and queue-based generation jobs. |
| TR-10 | In-browser Babel transpilation | Low | Low (current scale) | Resolved by Next.js migration. Low urgency while user base is small. |

---

### G.2 Business Risks

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| BR-01 | AI provider cost dependency | High | Certain at scale | Cost-per-strategy tracking in Sprint 3. Model selection policy (Haiku for low-sensitivity, Sonnet for strategy). Set cost thresholds per workspace tier. |
| BR-02 | Small team executing large platform vision | High | Certain | Prioritize ruthlessly. Sprint plan is 90 days not 30. Kill criteria defined below. Use playbook-first development: build one app completely before starting next. |
| BR-03 | No defined pricing model | Critical | Immediate | Define pricing model before first external client signs. Three options: per-workspace/month, per-strategy-run, per-user/month. Recommend: per-workspace/month with strategy run metering. |
| BR-04 | Competitive moat unclear vs. network-effect incumbents | Medium | Medium-term | File provisional patents on six disclosures in Section F. Build Playbook Library as data flywheel. Client portal model creates distribution multiplier that incumbents cannot easily replicate. |
| BR-05 | Client data privacy (no encryption at rest, no DPA) | High | Immediate for enterprise | Sprint 3 column-level encryption. Draft Data Processing Agreement before first enterprise client. Define data residency policy. |
| BR-06 | Revenue model undefined in platform (no billing) | Critical | Immediate | Implement usage metering in Sprint 3 (strategy runs, signals scanned). Connect to Stripe in post-Sprint 3 milestone. Do not gate behind billing before 5 paying clients are validated. |
| BR-07 | Dependency on external AI notetakers (Circleback) | Low | Low | Meeting notes import supports multiple sources (Circleback, Granola, Fathom, Otter). No single-point dependency. |

---

### G.3 Open Questions

| # | Question | Decision Owner | Deadline | Implications |
|---|---|---|---|---|
| OQ-01 | Will Ridge sell the platform as SaaS, or use it as an internal tool for services delivery? | Owen (CEO) | Before Sprint 2 | Determines whether multi-tenancy, billing, and white-label features are Sprint 2 priorities or post-90-day |
| OQ-02 | What is the pricing model? Per workspace, per user, per strategy run, or hybrid? | Owen (CEO) | Before first external client | Determines metering infrastructure and Stripe integration timing |
| OQ-03 | How will Ridge handle multi-tenant data isolation at enterprise scale? | Engineering | Sprint 1 (design), Sprint 3 (audit) | RLS policies in Sprint 1 handle this; enterprise SLA requires formal security audit |
| OQ-04 | Should Ridge build native CRM integrations or rely on iPaaS (Zapier, Make)? | Owen + Engineering | Sprint 2 planning | Native integrations (HubSpot, Salesforce) are Sprint 3. If timeline slips, Zapier webhooks are a viable Sprint 2 interim. |
| OQ-05 | What is the fully-loaded AI cost per strategy generation at current model mix? | Engineering | Sprint 1 (instrument and measure) | Anthropic Sonnet 4.5 at $3/$15 per M tokens. A typical strategy run may consume 8,000-15,000 output tokens. Estimated cost: $0.12-$0.23 per run at current prices. Measure actuals before setting pricing. |
| OQ-06 | Will Ridge support custom or fine-tuned models (e.g., a fine-tuned Claude on Ridge's strategy corpus)? | Owen (CEO) | Post-Sprint 3 | Relevant at 100+ strategy runs. Not actionable before that scale. Revisit in Q4 2026. |
| OQ-07 | Should the client portal be separately deployable as a white-label product? | Owen (CEO) | Before Sprint 2 | White-label portal = separate Next.js app with custom domain support. Adds Sprint 2 scope. High commercial value if Ridge targets agencies. |

---

### G.4 Kill Criteria

Kill criteria define the conditions under which a specific feature direction should be abandoned or pivoted. They are not failure predictions — they are pre-committed decision rules that prevent sunk-cost reasoning.

| # | Feature / Direction | Kill Condition | Trigger | Alternative |
|---|---|---|---|---|
| KC-01 | Strategy generation at current model mix | If fully-loaded cost per strategy run exceeds $1.00 at Sonnet prices AND volume exceeds 100 runs/month | Measured in Sprint 1 instrumentation | Migrate to Haiku for all sections except messaging; reduce Sonnet to exec summary only. Target: <$0.30/run. |
| KC-02 | Sequence Builder and Message Studio (Sprint 2) | If user engagement (messages sent per active workspace per week) is below 5 within 30 days of launch | Measured via Analytics Hub | Simplify to single-message draft (no full sequencing). Focus on signal-to-draft as the core engagement loop. |
| KC-03 | Native CRM integrations (Salesforce, HubSpot) | If CRM integration takes more than 2 sprints (60 days) to reach stable, bidirectional sync | Engineering assessment at Sprint 2 midpoint | Implement Zapier/Make webhooks as interim. Native integration deferred to post-90-day roadmap. |
| KC-04 | Full stack migration (Next.js + Supabase) | If migration causes any existing feature to regress AND regression cannot be resolved within 5 business days | QA testing during Sprint 1 | Roll back to current Neon + Vercel function stack for affected features. Run old and new stack in parallel via feature flag until regression resolved. |
| KC-05 | Patent filing (any of the six disclosures) | If prior art search reveals existing claims that cover the core novel elements of a specific disclosure | Legal review of prior art search (conduct before spending on provisional filing) | Narrow claims to distinguish from prior art. If no distinction is achievable, do not file. Direct IP budget to next candidate disclosure. |
| KC-06 | Client portal white-label offering | If white-label implementation requires more than 15 additional engineering days beyond core portal | Engineering estimate at Sprint 2 planning | Ship standard portal for all clients with Ridge branding. Revisit white-label as a paid tier feature post-Series A. |
| KC-07 | Analytics Hub cross-workspace aggregation | If data normalization (Sprint 1) is incomplete and JSON string storage cannot support aggregation queries at 50+ workspaces | Measured at end of Sprint 1 | Scope Analytics Hub to single-workspace views only in Sprint 2. Cross-workspace aggregation moves to post-Sprint 3. |

---

*End of Ridge Platform Expansion Brief v1.0*

*All section data is based on platform audit conducted April 17, 2026. Technical specifications reflect the live state of platform.joinridge.co at that date. This document is confidential and intended for internal use by Ridge.*
