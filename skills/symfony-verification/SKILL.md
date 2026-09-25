---
name: symfony-verification
description: "Verification loop for Symfony projects: env checks, linting, static analysis, tests with coverage, security scans, and deployment readiness. Use when verifying a Symfony project before merge or deploy — lint, static analysis, tests, coverage, security."
metadata:
  origin: ECC
---

# Symfony Verification Loop

Run before PRs, after major changes, and pre-deploy.

## When to Use

- Before opening a pull request for a Symfony project
- After major refactors or dependency upgrades
- Pre-deployment verification for staging or production
- Running full lint -> test -> security -> deploy readiness pipeline

## How It Works

- Run phases sequentially from environment checks through deployment readiness so each layer builds on the last.
- Environment and Composer checks gate everything else; stop immediately if they fail.
- Linting/static analysis should be clean before running full tests and coverage.
- Security and migration reviews happen after tests so you verify behavior before data or release steps.
- Build/deploy readiness and Messenger worker checks are final gates; any failure blocks release.

## Phase 1: Environment Checks

```bash
php -v
composer --version
bin/console --version
```

- Verify `.env` and `.env.local` are present and required keys exist
- Confirm `APP_DEBUG=0` for production environments
- Confirm `APP_ENV` matches the target deployment (`prod`, `staging`)

If using Symfony CLI locally:

```bash
symfony check:requirements
symfony console --version
```

## Phase 1.5: Composer and Autoload

```bash
composer validate --strict
composer dump-autoload -o
```

## Phase 2: Linting and Static Analysis

```bash
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/phpstan analyse
```

If your project uses Psalm instead of PHPStan:

```bash
vendor/bin/psalm
```

Symfony-specific container/config linting:

```bash
bin/console lint:yaml config
bin/console lint:twig templates
bin/console lint:container
bin/console debug:container --deprecations
```

## Phase 3: Tests and Coverage

```bash
vendor/bin/phpunit
```

Coverage (CI):

```bash
XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text --coverage-clover clover.xml
```

CI example (format -> static analysis -> tests):

```bash
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/phpstan analyse
XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text
```

## Phase 4: Security and Dependency Checks

```bash
composer audit
symfony check:security # Symfony CLI, checks composer.lock against the security advisories DB
```

## Phase 5: Database and Migrations

```bash
bin/console doctrine:migrations:status
bin/console doctrine:migrations:migrate --dry-run
bin/console doctrine:schema:validate
```

- Review destructive migrations carefully
- Ensure migration class names follow `VersionYYYYMMDDHHMMSS` (e.g., `Version20250314154210`) and describe the change clearly via a leading comment
- Ensure rollbacks are possible
- Verify `down()` methods and avoid irreversible data loss without explicit backups

## Phase 6: Build and Deployment Readiness

```bash
composer install --no-dev --optimize-autoloader
bin/console cache:clear --env=prod --no-debug
bin/console cache:warmup --env=prod --no-debug
```

- Ensure cache warmups succeed in production configuration
- Verify Messenger workers and any scheduled commands are configured
- Confirm `var/cache/` and `var/log/` are writable in the target environment

## Phase 7: Messenger / Worker Checks

```bash
bin/console messenger:stats
bin/console messenger:failed:show
```

Active verification (staging only): dispatch a no-op message to a dedicated transport and consume once (ensure a non-`sync` transport is configured).

```bash
bin/console messenger:consume healthcheck --limit=1 --time-limit=30
```

Verify the message produced the expected side effect (log entry, healthcheck table row, or metric).

Only run this on non-production environments where processing a test message is safe.

## Examples

Minimal flow:

```bash
php -v
composer --version
bin/console --version
composer validate --strict
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/phpstan analyse
vendor/bin/phpunit
composer audit
bin/console doctrine:migrations:migrate --dry-run
bin/console cache:clear --env=prod
bin/console messenger:failed:show
```

CI-style pipeline:

```bash
composer validate --strict
composer dump-autoload -o
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/phpstan analyse
bin/console lint:yaml config
bin/console lint:twig templates
XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text
composer audit
bin/console doctrine:migrations:migrate --dry-run
bin/console doctrine:schema:validate
composer install --no-dev --optimize-autoloader
bin/console cache:warmup --env=prod
bin/console messenger:stats
```
