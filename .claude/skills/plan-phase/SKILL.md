---
name: plan-phase
description: Breaking a PRD down into implementation phases. Use when a PRD is ready and a development plan with independent phases is needed.
---

# Plan Generator

Read the PRD from file: $ARGUMENTS

Create an implementation plan and save it to 'docs/plan-$ARGUMENTS.md' (translate to English and use kebab-case)

## Plan structure:

# Plan: {feature name}

**PRD:** $ARGUMENTS
**Date:** {current date}

## Implementation phases

### Phase 1: {name}

**Goal:** What this phase delivers
**Affects:** backend / frontend / database
**Tasks:**

- [ ] Task 1
- [ ] Task 2

**Done when:** Concrete criterion

### Phase 2: {name}

...

## Phase breakdown rules:

- Each phase must deliver a working result.
- Phases are independent; work can stop after any of them.
- The first phase is the minimal working path (Tracer Bullet).
- No more than five tasks per phase.
- Backend and frontend of the same feature go in different phases.
- Every phase must include planned tests covering that phase's functionality.

## Rules

- Read the PRD carefully; the plan must cover all acceptance criteria.
- Don't add tasks that aren't in the PRD.
- If the PRD is incomplete, ask a question before creating the plan.
