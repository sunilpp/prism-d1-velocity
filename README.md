# PRISM D1: Velocity — AI Development Lifecycle Workshop

> Compress the idea-to-production loop with disciplined AI adoption.

Part of the [PRISM Framework](../README.md) (Progressive Readiness Index for Scalable Maturity) — the D1 Velocity pillar focuses on AI-native software development lifecycle practices that are **measurable from Day 1**.

## What This Repo Contains

### For Engineering Leaders (Top-Down Visibility)

- **AWS-native dashboards** comparable to Jellyfish/Swarmia — but built on CloudWatch + QuickSight
- **Enhanced DORA metrics** with AI-specific dimensions (acceptance rate, AI-to-merge ratio, eval gate pass rate)
- **Executive readout templates** that connect engineering metrics to business outcomes
- **PRISM level tracking** — see your org's maturity score change over time

### For Engineering Teams (Bottom-Up Activation)

- **4-hour workshop** with hands-on exercises using Claude Code + Bedrock
- **Spec-driven development** templates compatible with Kiro
- **Bootstrapper code** — git hooks, CI workflows, eval harnesses teams inherit permanently
- **Sample application** to practice AI-DLC patterns against

## Quick Start

### Prerequisites

- AWS Account with Bedrock access (Claude models enabled)
- Node.js 20+ and npm
- AWS CDK v2 (`npm install -g aws-cdk`)
- Claude Code CLI installed and configured to use Bedrock
- Git 2.40+

### Deploy the Metrics Platform

```bash
cd infra
npm install
npx cdk bootstrap   # First time only
npx cdk deploy --all
```

### Run the Workshop

Start with [Module 00: Prerequisites](workshop/00-prerequisites/README.md) and work through sequentially.

### Adopt the Bootstrapper (Post-Workshop)

```bash
# Copy into your project
cp -r bootstrapper/ ~/your-repo/.prism/
cd ~/your-repo

# Install hooks and workflows
.prism/metric-hooks/install.sh
cp .prism/github-workflows/*.yml .github/workflows/
cp .prism/claude-code/CLAUDE.md ./CLAUDE.md

# Configure your team ID
echo 'PRISM_TEAM_ID=your-team-name' >> .env
```

## Enhanced AI-DORA Metrics

| Metric | Source | L2 Target | L4 Target |
|--------|--------|-----------|-----------|
| Deployment Frequency | GitHub/CodePipeline | Weekly | Daily+ |
| Lead Time for Changes | PR created → deployed | < 1 week | < 1 day |
| Change Failure Rate | Rollback/hotfix ratio | < 15% | < 5% |
| MTTR | Incident → resolution | < 24h | < 1h |
| **AI Acceptance Rate** | Git hooks + Claude Code | >= 30% | >= 55% |
| **AI-to-Merge Ratio** | CI metadata | >= 20% | >= 45% |
| **Spec-to-Code Turnaround** | Spec commit → PR ready | Baseline set | < 2 days |
| **Post-Merge Defect Rate** | Bug tracker + AI origin tag | <= 1.2x human | <= 0.9x |
| **Eval Gate Pass Rate** | Bedrock Evaluations in CI | >= 80% | >= 95% |
| **AI Test Coverage Delta** | Coverage tool + AI origin tag | > 15% | > 40% |

## Workshop Modules

| # | Module | Duration | Key Outcome |
|---|--------|----------|-------------|
| 00 | [Prerequisites](workshop/00-prerequisites/) | 30 min | Environment ready, Bedrock access confirmed |
| 01 | [AI-SDLC Foundations](workshop/01-ai-sdlc-foundations/) | 45 min | Claude Code configured, first AI-assisted commit |
| 02 | [Spec-Driven Development](workshop/02-spec-driven-development/) | 45 min | Kiro spec → Claude Code implementation flow |
| 03 | [Instrumenting AI Metrics](workshop/03-instrumenting-ai-metrics/) | 45 min | Git hooks + CI emitting enhanced DORA events |
| 04 | [Eval Gates in CI/CD](workshop/04-eval-gates-cicd/) | 45 min | Bedrock Evaluation gate blocking bad merges |
| 05 | [Dashboards & Visibility](workshop/05-dashboards-visibility/) | 30 min | Executive + team dashboards live |

## Architecture

```
Developer Workstation              AWS Metrics Platform
────────────────────              ────────────────────
Claude Code ──────┐
Kiro Specs ───────┤               ┌──────────────┐
Git Hooks ────────┼── API GW ───→ │ EventBridge  │
GitHub Actions ───┤               └──────┬───────┘
Bedrock Evals ────┘                      │
                                  ┌──────▼───────┐
                                  │   Lambda     │  enrich + normalize
                                  └──────┬───────┘
                                         │
                                ┌────────┼────────┐
                                ▼        ▼        ▼
                            DynamoDB  DynamoDB CloudWatch
                            (events) (metadata)   │
                                │        │        │
                                └────────┼────────┘
                                         ▼
                              ┌──────────────────┐
                              │    QuickSight    │  Executive Readout
                              │    CloudWatch    │  Team Dashboard
                              └──────────────────┘
```

## PRISM Maturity Levels (D1 Velocity)

| Level | Name | What It Looks Like |
|-------|------|--------------------|
| L1 | Experimental | Ad hoc AI use, no metrics, no shared tooling |
| L2 | Structured | Claude Code + Kiro adopted, acceptance rate tracked in CI |
| L3 | Integrated | Eval gates in pipeline, AI-DORA dashboards live, spec-driven workflow |
| L4 | Orchestrated | Multi-team platform, AI FinOps, governed agent scope |
| L5 | Autonomous | Agents contributing to architecture, >20% autonomous deployments |

## License

Internal use — AWS Solutions Architecture, Startups Organization.
