---
paths:
  - "**/*.php"
  - "**/phpunit.xml"
  - "**/phpunit.xml.dist"
  - "**/composer.json"
---
# PHP Testing

> This file extends [common/testing.md](../common/testing.md) with PHP specific content.

## Framework

Use **PHPUnit** as the default test framework, with `symfony/test-pack` (`KernelTestCase`/`WebTestCase`) and **Foundry** (`zenstruck/foundry`) for factories.

## Coverage

```bash
vendor/bin/phpunit --coverage-text
```

Prefer **pcov** or **Xdebug** in CI, and keep coverage thresholds in CI rather than as tribal knowledge.

## Test Organization

- Separate fast unit tests from framework/Doctrine integration tests.
- Use Foundry factories for fixtures instead of large hand-written arrays.
- Keep HTTP/controller tests focused on transport and validation; move business rules into service-level tests.

## Decoupled React Frontend

If the API is consumed by a separate React SPA (rather than server-rendered Twig), keep functional tests focused on the JSON contract — status codes, response shape, and Serializer groups — rather than asserting on HTML. Verify the contract with `WebTestCase` + `assertJsonStringEqualsJsonString`/`assertResponseStatusCodeSame` and leave UI-level assertions to the `react-testing` skill on the frontend side.

## Reference

See skill: `tdd-workflow` for the repo-wide RED -> GREEN -> REFACTOR loop.
See skill: `symfony-tdd` for Symfony-specific testing patterns (PHPUnit and Foundry).
