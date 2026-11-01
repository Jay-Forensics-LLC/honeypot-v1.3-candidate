# Phase Scaffolding Entities

**Created in Phase 1 for future phases - NOT YET ACTIVE**

These entities were created in advance to support upcoming features but are NOT wired to any UI or backend logic yet. They remain dormant until their respective phase implementations.

## Phase 2: Control Plane Automated Response
- `ControlPlaneAutomationSettings` - Org-level automation configuration
- `ControlPlanePlaybookMapping` - Maps indicators to playbook executions
- `ControlPlaneMitigationRecommendation` - AI-assisted mitigation suggestions

**Status**: Entities exist, no UI, no scheduled jobs, no backend functions using them yet.
**Activation**: Phase 2 implementation will wire these entities to backend functions first, then UI.

## Phase 3: Policy Lifecycle Management
- `PolicyVersion` - Version history for SecurityPolicy
- `PolicyTemplate` - Reusable policy templates

**Status**: Entities exist, no UI, no lifecycle workflow implemented yet.
**Activation**: Phase 3 implementation.

## Phase 4: Proactive Threat Intel Correlation
- `ProactiveRiskAlert` - Threat intel correlation alerts

**Status**: Entity exists, no correlation engine, no UI yet.
**Activation**: Phase 4 implementation.

## General Infrastructure
- `ApprovalQueueItem` - Generic approval gate for multi-phase use

**Status**: Entity exists, ready for Phase 2/3 approval workflows.

---

## Critical Rules

These entities are intentionally NOT referenced in:
- Navigation configuration
- Any page components
- Any active backend functions (except preparation work)
- Any scheduled automations

**Violation Detection**: Any attempt to add navigation items or UI pages for these entities before their phase implementation must be rejected.

**Activation Checklist** (per phase):
1. Backend functions implemented and tested
2. Audit logging confirmed
3. Feature flags respected
4. UI integration to EXISTING pages only
5. No new navigation items without explicit approval

This document serves as the canonical source for entity activation status.