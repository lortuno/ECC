---
name: example-skill
description: Use this skill when creating, reviewing, or running Doctrine/Symfony database migrations, to catch destructive schema changes (dropped columns or tables, non-nullable columns added without a default, irreversible data loss) before they run against a real database.
metadata:
  origin: example
allowed-tools: Read, Glob, Grep, Bash, Edit
---

# Doctrine Migration Guard (worked example)

Stops destructive Doctrine migrations from running unreviewed. This is the worked example referenced by [HOW_TO_CREATE_A_SKILL.md](../../../HOW_TO_CREATE_A_SKILL.md) — copy the *pattern* (structure, guardrail checklist, anti-patterns), not necessarily this exact content, into your own skill.

Directory is named `example-skill` (not `doctrine-migration-guard`) deliberately, so it can't be mistaken for a curated ECC skill if this repo is scanned — see the guide's placement section for why that distinction matters.

## When to Activate

- Generating a new Doctrine migration (`bin/console make:migration` / `doctrine:migrations:diff`)
- Reviewing a migration file before it's committed or run
- A migration touches a column/table that already has production data
- Running `doctrine:migrations:migrate` against anything other than a fresh local database

## Core Concepts

### The three destructive patterns to catch

1. **Dropped column/table with no backup step** — data is gone the moment the migration runs; there's no "undo".
2. **New `NOT NULL` column with no default on an existing table** — fails immediately on any row that predates the migration, or silently truncates data if the DBAL fills a placeholder.
3. **Renamed column implemented as drop + add** — Doctrine's diff tool does this by default; it reads as a rename but executes as data loss.

### Guardrail checklist — answer explicitly before allowing the migration to run

1. Does this migration drop a column or table? If yes: is there a prior migration or export step that preserves the data first?
2. Does this migration add a `NOT NULL` column to a table that can already have rows? If yes: does it set a default or backfill in a prior step?
3. Is Doctrine's diff tool reporting a rename as drop+add? If yes: rewrite it as an explicit rename instead.
4. Has this been tested against a copy of production-shaped data (even a small synthetic sample), not just an empty local database?

If any answer is "no" or "unsure": stop and ask the user before running `doctrine:migrations:migrate` — don't proceed silently. This is an advisory guardrail (see the guide's "guardrails" section for the difference between this and an enforced one).

## Anti-Patterns

### Silent drop — do not do this

```php
public function up(Schema $schema): void
{
    $this->addSql('ALTER TABLE recipe DROP COLUMN legacy_notes');
}
```

No prior export, no `down()` that restores data — this is unrecoverable.

### Drop with a preservation step — do this instead

```php
public function up(Schema $schema): void
{
    // Data preserved in recipe_archive by migration Version20260101000000 — see its up().
    $this->addSql('ALTER TABLE recipe DROP COLUMN legacy_notes');
}

public function down(Schema $schema): void
{
    $this->addSql('ALTER TABLE recipe ADD COLUMN legacy_notes LONGTEXT DEFAULT NULL');
    // Restoring values themselves requires recipe_archive — down() is a structural-only revert.
}
```

### NOT NULL without a default — do not do this

```php
$this->addSql('ALTER TABLE recipe ADD COLUMN servings INT NOT NULL');
```

Fails immediately if `recipe` has any existing rows.

### Backfill before constraining — do this instead

```php
$this->addSql('ALTER TABLE recipe ADD COLUMN servings INT DEFAULT NULL');
$this->addSql('UPDATE recipe SET servings = 4 WHERE servings IS NULL');
$this->addSql('ALTER TABLE recipe CHANGE servings servings INT NOT NULL');
```

## Best Practices

- Always read the generated migration before running it — `make:migration`/`diff` produce a first draft, not a final answer.
- Write `down()` for every `up()` that can be reverted structurally, even when the data itself can't be un-lost.
- Test against a non-empty database locally before merging.
- Prefer expand-and-contract (add nullable → backfill → constrain → drop old, across separate deploys) over doing it all in one migration when the table is large or already in production.

## Related Skills

- `database-migrations`
- `symfony-patterns`
- `security-review`
