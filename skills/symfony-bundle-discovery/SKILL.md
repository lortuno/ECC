---
name: symfony-bundle-discovery
description: Discover and evaluate Symfony bundles and PHP packages via Packagist and Composer. Use when the user wants to find bundles, check package health, or assess Symfony/PHP version compatibility.
metadata:
  origin: ECC
---

# Symfony Bundle Discovery

Find, evaluate, and choose healthy Symfony bundles and Composer packages using Packagist and standard Composer/Symfony CLI tooling. Unlike the Laravel ecosystem, there is no single third-party "package health" MCP for Symfony — this skill uses Packagist's public API and Composer/Symfony CLI commands directly, or the `documentation-lookup` skill for library docs.

## When to Use

- User wants to find Symfony bundles for a specific feature (e.g. "auth", "permissions", "admin panel")
- User asks "what bundle should I use for..." or "is there a Symfony bundle for..."
- User wants to check if a package is actively maintained
- User needs to verify Symfony version compatibility
- User wants to assess package health before adding it to a project

## Tools

No MCP server is required. Use `WebFetch` against Packagist's public JSON API, or shell out to Composer/Symfony CLI commands via `Bash`.

### Packagist Search API

```
GET https://packagist.org/search.json?q={keyword}&tags={tag}
```

Returns package name, description, downloads, and repository URL for matching packages.

### Packagist Package Details

```
GET https://repo.packagist.org/p2/{vendor}/{package}.json
```

Returns full version history, `require`/`require-dev` constraints per version (including `symfony/*` and `php` constraints), maintainers, and abandonment status (`"abandoned": true` or a suggested replacement string).

### Composer CLI

```bash
composer show -a vendor/package        # installed package details
composer show -a vendor/package --all  # available versions + constraints, even if not installed
composer why-not symfony/framework-bundle 7.0 vendor/package  # check compatibility before upgrading
composer outdated --direct             # health signal: how stale are direct deps
```

### Symfony Flex Recipes (maintenance signal)

A bundle with a published Flex recipe (searchable at the [Symfony Recipes repository](https://github.com/symfony/recipes) and [symfony/recipes-contrib](https://github.com/symfony/recipes-contrib)) is a strong signal of active, first-class Symfony integration — Flex auto-configures `config/packages/*.yaml` and `config/bundles.php` on install.

## How It Works

### Finding Bundles

When the user wants to discover bundles for a feature:

1. Query the Packagist search API with relevant keywords and, optionally, a `tags` filter (e.g. `symfony`, `symfony-bundle`).
2. Cross-check top results against `repo.packagist.org/p2/{vendor}/{package}.json` for `abandoned` status and the most recent tagged version's date.
3. Prefer packages that ship a Flex recipe or explicitly declare a `symfony/*` dependency matching the target version.

### Evaluating Packages

When the user wants to assess a specific package:

1. Fetch `https://repo.packagist.org/p2/{vendor}/{package}.json` for the full version list.
2. Check the latest version's release date, the `symfony/framework-bundle` / `php` constraints, and whether `abandoned` is set.
3. Check the GitHub repository (via `WebFetch` on the repository URL from the Packagist metadata) for recent commits, open issues, and CI status as secondary signals.

### Checking Compatibility

When the user needs Symfony or PHP version compatibility:

1. Fetch the package's Packagist metadata and inspect `require.symfony/*` and `require.php` per version.
2. Or run `composer why-not symfony/framework-bundle <target-version> vendor/package` locally to see exactly what blocks an upgrade.

## Examples

### Example: Find Authentication Bundles

```
GET https://packagist.org/search.json?q=authentication&tags=symfony-bundle
```

Returns bundles matching "authentication":
- lexik/jwt-authentication-bundle
- hwi/oauth-bundle
- scheb/2fa-bundle

### Example: Find Symfony 7-Compatible Admin Bundles

```
GET https://repo.packagist.org/p2/easycorp/easyadmin-bundle.json
```

Inspect the latest version's `require.symfony/framework-bundle` constraint to confirm Symfony 7 support.

### Example: Get Package Details via Composer

```bash
composer show -a doctrine/orm --all
```

Returns:
- Available versions and their release dates
- `require`/`require-dev` constraints per version
- Whether the package is abandoned (and any suggested replacement)
- License and homepage

### Example: Find Packages by Vendor

```
GET https://packagist.org/search.json?q=vendor:symfony
```

Returns all packages published under the `symfony/` vendor namespace.

## Filtering Best Practices

### By Maintenance Signal

| Signal | Meaning |
|--------|---------|
| Recent tagged release (< 6 months) | Actively maintained |
| Has a Flex recipe | First-class Symfony integration |
| `"abandoned"` set on Packagist | Do not add to new projects; migrate off if already used |
| No `symfony/*` constraint at all | May not be Symfony-specific; verify it isn't a Laravel-only or framework-agnostic package before assuming Symfony support |

**Recommendation**: Prefer actively maintained packages with a Flex recipe for production applications.

### By Symfony Version

| Version | Notes |
|---------|-------|
| `7.x` | Latest LTS-track major |
| `6.4` | Current LTS |
| `6.0`-`6.3` | Still common, approaching end of maintenance |
| `<= 5.4` | Legacy; check for an active fork before adopting |

**Recommendation**: Match the target project's Symfony version constraint exactly (`composer.json` `symfony/framework-bundle` requirement).

### Combining Filters

```bash
# Find packages tagged for Symfony that mention "permission", then check
# each candidate's Symfony version constraint individually via Packagist p2 metadata.
curl -s "https://packagist.org/search.json?q=permission&tags=symfony-bundle"
```

## Response Interpretation

### Search Results

Each result includes:
- Package name (e.g. `symfony/security-bundle`)
- Brief description
- Download counts (a rough popularity/maintenance proxy)
- Repository URL

### Package (p2) Metadata

The detailed response includes, per version:
- **require**: including `php` and `symfony/*` constraints
- **time**: release timestamp (staleness signal)
- **abandoned**: `false`, `true`, or a suggested replacement package name
- **authors**/**support**: maintainer and issue-tracker links

## Common Use Cases

| Scenario | Recommended Approach |
|----------|---------------------|
| "What bundle for auth?" | Search "authentication" + `tags=symfony-bundle`, check abandonment |
| "Is vendor/package still maintained?" | Fetch p2 metadata, check latest release date and `abandoned` |
| "Need Symfony 7 packages" | Fetch p2 metadata, check `require.symfony/framework-bundle` per version |
| "Find admin panel bundles" | Search "admin", filter to `symfony-bundle` tag, compare Flex recipe availability |
| "Check vendor reputation" | Search by vendor namespace, review each package's abandonment/staleness |

## Best Practices

1. **Always check abandonment** — Packagist's `abandoned` field is authoritative; never recommend an abandoned package for new work.
2. **Match Symfony version** — Always check the `symfony/*` constraint matches the target project.
3. **Prefer Flex-recipe bundles** — A published recipe means less manual wiring and closer first-party support.
4. **Verify before recommending** — Fetch the p2 metadata for a comprehensive assessment; don't rely on the package name alone.
5. **No API key needed** — Packagist's search and p2 APIs are public and unauthenticated.

## Related Skills

- `symfony-patterns` — Symfony architecture and patterns
- `symfony-tdd` — Test-driven development for Symfony
- `symfony-security` — Symfony security best practices
- `documentation-lookup` — General library documentation lookup (Context7)
