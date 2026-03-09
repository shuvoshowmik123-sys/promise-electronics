# 001 Modular Monolith

**Status**: Accepted

**Date**: 2026-03-01

## Context

The system has grown significantly to encompass Administration, Customer tracking, Corporate portal, and Point of Sale (POS), alongside a companion mobile application built in Flutter. We currently have a single Node.js backend (`server/`) communicating with a unified database via Drizzle ORM. The central `storage.ts` interface has become heavily bloated (>4000 lines). There is a structural need to scale development, maintain boundaries, and simplify testing.

The standard choice in modern scaling is migrating to microservices, where each portal or domain operates independently.

## Decision

We have decided to maintain a **Modular Monolith** architecture and explicitly reject a microservices migration. 

Instead of splitting infrastructure, we will decompose domain logic into internal services within the monolithic codebase (e.g., `JobService`, `InventoryService`, `FinanceService`). The `storage.ts` interface will act merely as a data repository layer underneath these services. Frontend portals will remain bundled but strict import boundaries will be established via domain-specific API clients (e.g., `adminApi.ts`, `customerApi.ts`).

## Consequences

**Positive:**
- Significantly reduces infrastructure complexity and operational overhead (DevOps).
- Retains unified database transactions and foreign key constraints.
- Eases deployment (single `npm run start`).
- Simplifies local developer setup.

**Negative:**
- We cannot independently scale specific modules (e.g., if Job module gets heavy traffic, we scale the whole monolith).
- Strict discipline is required (via ESLint and Code Reviews) to prevent code crossover, as there are no hard physical boundaries.
