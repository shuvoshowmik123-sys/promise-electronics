# JSONB Migration Plan

## Overview
This document outlines the plan to migrate several text-based JSON columns to native PostgreSQL `jsonb` types. This change will improve query performance, data integrity, and developer experience by leveraging PostgreSQL's native JSON capabilities.

## Candidates for Migration

The following columns have been identified as storing JSON data in `text` format and are candidates for migration to `jsonb`:

| Table | Column | Current Type | Content Description |
|-------|--------|--------------|---------------------|
| `users` | `permissions` | `text` | User permission flags (e.g., `{"canEdit": true}`) |
| `users` | `preferences` | `text` | User UI/Notification preferences |
| `inventory_items` | `features` | `text` | Product features list or key-value pairs |
| `inventory_items` | `images` | `text` | Array of image URLs |
| `challans` | `line_items` | `text` | Array of items in the challan |
| `pos_transactions` | `items` | `text` | Array of purchased items |
| `pos_transactions` | `linked_jobs` | `text` | Array of linked job IDs |
| `service_requests` | `symptoms` | `text` | Array of selected symptoms |
| `service_requests` | `media_urls` | `text` | Array of uploaded media URLs |
| `spare_part_orders` | `symptoms` | `text` | Array of symptoms |
| `spare_part_orders` | `images` | `text` | Array of image URLs |

## Benefits
1.  **Query Efficiency**: Enable indexing and querying within the JSON structure (e.g., finding all sales of a specific product ID).
2.  **Data Integrity**: PostgreSQL enforces valid JSON format at the database level.
3.  **Code Simplification**: Remove the need for manual `JSON.parse()` and `JSON.stringify()` in the application layer; Drizzle ORM handles this automatically.

## Migration Strategy (Zero Downtime Approach)

Since we are in a development/staging environment, we can use a simpler strategy, but a safe approach is recommended.

### Step 1: Database Migration Script
We will create a migration script that performs the following for each column:

1.  **Add Temporary Column**: Add a new column with `_jsonb` suffix.
    ```sql
    ALTER TABLE users ADD COLUMN permissions_jsonb JSONB DEFAULT '{}';
    ```

2.  **Data Migration**: Parse and copy data from the text column to the jsonb column.
    ```sql
    UPDATE users SET permissions_jsonb = permissions::jsonb WHERE permissions IS NOT NULL AND permissions != '';
    ```

3.  **Verification**: Ensure data integrity.

4.  **Swap Columns**:
    *   Drop the old text column.
    *   Rename the new jsonb column to the original name.
    ```sql
    ALTER TABLE users DROP COLUMN permissions;
    ALTER TABLE users RENAME COLUMN permissions_jsonb TO permissions;
    ```

### Step 2: Codebase Updates

1.  **Update Schema Definition (`shared/schema.ts`)**:
    Change `text(...)` to `jsonb(...)` for the identified columns.
    ```typescript
    // Before
    permissions: text("permissions").default("{}"),
    
    // After
    permissions: jsonb("permissions").$type<UserPermissions>().default({}),
    ```

2.  **Update Zod Schemas**:
    Ensure Zod schemas expect objects/arrays instead of JSON strings.
    ```typescript
    // Before
    permissions: z.string(),
    
    // After
    permissions: z.object({ ... }).optional(),
    ```

3.  **Refactor Application Logic**:
    *   Search for `JSON.parse(user.permissions)` and remove manual parsing.
    *   Search for `JSON.stringify(...)` before database inserts and remove it.

## Execution Plan

1.  **Phase 1: Users & Settings** (Low Risk)
    *   Migrate `users.permissions` and `users.preferences`.
    *   Update Auth and User settings logic.

2.  **Phase 2: Inventory & Service Requests** (Medium Risk)
    *   Migrate `inventory_items` and `service_requests` columns.
    *   Update Catalog and Request submission logic.

3.  **Phase 3: Transactions & Orders** (High Risk - Core Business Data)
    *   Migrate `pos_transactions`, `challans`, and `spare_part_orders`.
    *   Requires careful testing of POS and Order management flows.

## Rollback Plan
If issues arise, revert the code changes to use `JSON.stringify/parse` and cast the `jsonb` column back to text in queries until the database can be reverted.
