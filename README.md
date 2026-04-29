# PRISM D1: Velocity — AI Development Lifecycle Workshop

> :warning: **Sample Project — Not Production-Ready**
>
> This project is provided as a sample and reference implementation only. It is not designed, tested, or hardened for production use. Use it as a starting point or learning resource, and perform your own security review, testing, and operational hardening before deploying to any production environment.

> Compress the idea-to-production loop with disciplined AI adoption.

Part of the [PRISM Framework](../README.md) (Progressive Readiness Index for Scalable Maturity) — the D1 Velocity pillar focuses on AI-native software development lifecycle practices that are **measurable from Day 1**.

## What This Repo Contains

### For Engineering Leaders (Top-Down Visibility)

- **[Executive Readout Dashboard](docs/dashboard-executive.html)** ([spec](docs/data-architecture.md#cloudwatch-executive-readout-prism-d1-executive-readout)) — Strategic overview: PRISM level, DORA summary, AI contribution trends, security & compliance posture, cost intelligence
- **[PRISM Level Tracker](docs/data-architecture.md#quicksight-prism-level-tracker)** (QuickSight) — Maturity progression by team, radar chart of sub-dimensions, benchmarks by funding stage
- **[AI-DORA Analysis](docs/data-architecture.md#quicksight-ai-dora-analysis)** (QuickSight) — Deep-dive exploratory analysis across teams, repos, and AI tools with KPI trend cards
- **[CISO Compliance Dashboard](docs/data-architecture.md#cloudwatch-ciso-compliance-prism-d1-ciso-compliance)** — Security posture, AI code risk profile, shift-left effectiveness, remediation SLA tracking
- **Enhanced DORA metrics** with AI-specific dimensions (acceptance rate, AI-to-merge ratio, eval gate pass rate)
- **[Executive readout templates](docs/leader-guide/executive-readout-template.md)** that connect engineering metrics to business outcomes

### For Engineering Teams (Bottom-Up Activation)

- **[Team Velocity Dashboard](docs/dashboard-team.html)** ([spec](docs/data-architecture.md#cloudwatch-team-velocity-prism-d1-team-velocity)) — Real-time operational view: DORA metrics, eval gate quality by rubric, guardrail safety, MCP tool governance, cost per commit, AI vs human defect rates
- **4-hour workshop** (+ extensions) with hands-on exercises using Claude Code + Bedrock
- **Spec-driven development** templates compatible with Kiro
- **AI agent development** — build agents with Strands SDK, MCP, and Amazon Bedrock AgentCore
- **Bootstrapper code** — git hooks, CI workflows, eval harnesses, [AI-DLC steering files](bootstrapper/aidlc-steering/), [Security Agent setup](bootstrapper/security-agent/) ([setup guide](bootstrapper/security-agent/SETUP-GUIDE.md)), and agent configs teams inherit permanently
- **Sample application** with task API + MCP server (with [scope-based auth](sample-app/src/mcp/auth/)) + Strands agent to practice AI-DLC patterns

## Quick Start

### Prerequisites

Run the setup script to install and verify everything automatically:

```bash
./scripts/setup.sh
```

Or install manually:

- AWS Account with Bedrock access (Claude models enabled)
- Node.js 20+ and npm
- Python 3.11+ (for Strands Agent)
- AWS CLI v2 and CDK v2 (`npm install -g aws-cdk`)
- Claude Code CLI configured for Bedrock (`export CLAUDE_CODE_USE_BEDROCK=1`)
- Git 2.40+, jq, GitHub CLI

The setup script supports flags:
- `--skip-aws` — skip AWS credential and Bedrock checks (for offline prep)
- `--skip-kiro` — skip Kiro IDE check
- `--verify-only` — only verify, don't install anything

### Deploy the Metrics Platform

```bash
cd infra
npm install
npx cdk bootstrap   # First time only
npx cdk deploy --all
```

### Assess a Customer

Run the [PRISM Assessment](assessment/README.md) to determine maturity level and onboarding track. See the [full methodology guide](assessment/ASSESSMENT-GUIDE.md) for scanner logic, interview rubrics, and scoring formulas.

### Run the Workshop

Start with [Module 00: Prerequisites](workshop/00-prerequisites/README.md) and work through sequentially.

### Run the Sample Agent (No AWS Required)

```bash
cd sample-app
npm install && npm run dev          # Start the task API

cd agent
pip install -e ".[dev]"
python scripts/run-demo.py --mock   # Run agent demo with mock model
```

### Adopt the Bootstrapper (Post-Workshop)

```bash
# Copy into your project
cp -r bootstrapper/ ~/your-repo/.prism/
cd ~/your-repo

# Install hooks and workflows
.prism/metric-hooks/install.sh
cp .prism/github-workflows/*.yml .github/workflows/
cp .prism/claude-code/CLAUDE.md ./CLAUDE.md

# For agent projects, also copy:
cp .prism/agent-configs/ ./agent-configs/
cp .prism/claude-code/CLAUDE-agent.md ./CLAUDE-agent.md

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
| 02 | [Agent Development](workshop/02-agent-development/) | 70 min | Strands agent + MCP server + multi-agent orchestration |
| 03 | [Spec-Driven Development](workshop/03-spec-driven-development/) | 45 min | Kiro spec → Claude Code implementation flow |
| 04 | [Instrumenting AI Metrics](workshop/04-instrumenting-ai-metrics/) | 45 min | Git hooks + CI emitting enhanced DORA events |
| 05 | [Eval Gates in CI/CD](workshop/05-eval-gates-cicd/) | 45 min | Bedrock Evaluation gate blocking bad merges |
| 06 | [Dashboards & Visibility](workshop/06-dashboards-visibility/) | 30 min | Executive + team dashboards live |

## Architecture

![PRISM D1 Velocity Architecture](assets/images/architecture-overview.svg)

## PRISM Maturity Levels (D1 Velocity)

| Level | Name | What It Looks Like |
|-------|------|--------------------|
| L1 | Experimental | Ad hoc AI use, no metrics, no shared tooling |
| L2 | Structured | Claude Code + Kiro adopted, acceptance rate tracked in CI |
| L3 | Integrated | Eval gates in pipeline, AI-DORA dashboards live, spec-driven workflow |
| L4 | Orchestrated | Multi-team platform, AI FinOps, governed agent scope |
| L5 | Autonomous | Agents contributing to architecture, >20% autonomous deployments |

## AI Agent Development

The repo includes a complete agent development stack for PRISM Level 3+ teams:

| Component | Technology | Location |
|-----------|-----------|----------|
| **Agent Framework** | Strands Agents SDK (Python) | `sample-app/agent/` |
| **Tool Integration** | Model Context Protocol (MCP) | `sample-app/src/mcp/` |
| **Production Hosting** | Amazon Bedrock AgentCore | `bootstrapper/agent-configs/` |
| **Agent Eval** | Bedrock Evaluations | `bootstrapper/eval-harness/rubrics/agent-quality.json` |
| **Workshop** | Module 02: Agent Development | `workshop/02-agent-development/` |

## Competitive Landscape & Roadmap

- **[Competitive Landscape](docs/competitive-landscape.md)** — How PRISM D1 compares to Swarmia, Jellyfish, LinearB, DX, Faros AI, and Pluralsight Flow across DORA, AI-native metrics, and platform capabilities
- **[Community Roadmap](docs/ROADMAP.md)** — 47 prioritized backlog items across 9 phases to reach and exceed feature parity with commercial tools — open for community contributions
- **[Data Architecture & Dashboard Guide](docs/data-architecture.md)** — Complete metrics pipeline: 8 data sources, 14 event types, 4 dashboards (with widget-by-widget guide), CloudWatch metrics catalog, and token/cost intelligence pipeline

**GitHub Pages**: [sunilpp.github.io/prism-d1-velocity](https://sunilpp.github.io/prism-d1-velocity/)

## License

Internal use — AWS Solutions Architecture, Startups Organization.
