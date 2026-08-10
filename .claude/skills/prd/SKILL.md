---
name: prd
description: Creates a PRD document for a feature following the project's standard structure. Use when you need to describe requirements for a new feature before implementation.
---

# PRD generator

Create a PRD (Product Requirements Document) for the following feature: $ARGUMENTS

Save the result to 'docs/prd-$ARGUMENTS.md' (translate to English and use kebab-case)

If the /docs folder doesn't exist - create it

## Document structure

# PRD: {feature name}

**Date**: {current date}
**Status**: Draft

## Goal

One or two sentences on what this is and why the user needs it.

## User scenarios

- User {action} -> {Result}

## In scope

What's included in the feature - a concrete list

## Out of scope

What we explicitly won't do in this iteration

## Technical constraints

Known constraint that needs to be taken into account

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Rules

- Be specific - no fluff
- Acceptance criteria must be verifiable
- Don't describe how to implement - only what and why
- If the description is short - ask clarifying questions until you have full understanding, before creating the file
