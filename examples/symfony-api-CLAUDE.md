# Symfony API — Project CLAUDE.md

> Real-world example for a Symfony API with PostgreSQL, Redis, and Messenger.
> Copy this to your project root and customize for your service.

## Project Overview

**Stack:** PHP 8.2+, Symfony 7.x, PostgreSQL, Redis, Messenger, PHPUnit + Foundry, Docker Compose

**Architecture:** Modular Symfony app with controllers -> services -> handlers, Doctrine ORM, Messenger for async work, DTOs + Validator constraints for input, and the Serializer component for consistent JSON responses.

## Critical Rules

### PHP Conventions

- `declare(strict_types=1)` in all PHP files
- Use typed properties and return types everywhere
- Prefer `final` classes for services and handlers
- No `dd()` or `dump()` in committed code
- Formatting via PHP-CS-Fixer (PSR-12)

### API Response Envelope

All API responses use a consistent envelope:

```json
{
  "success": true,
  "data": {"...": "..."},
  "error": null,
  "meta": {"page": 1, "per_page": 25, "total": 120}
}
```

### Database

- Migrations committed to git (Doctrine Migrations Bundle)
- Use Doctrine DQL/QueryBuilder (no raw SQL unless parameterized)
- Index any column used in `WHERE` or `ORDER BY`
- Avoid mutating entities directly in controllers; prefer create/update through services or repositories

### Authentication

- API auth via LexikJWTAuthenticationBundle (or API Platform's built-in auth)
- Use Voters for entity-level authorization
- Enforce auth via `#[IsGranted]` and `access_control` in `security.yaml`

### Validation

- Use DTOs with Symfony Validator constraints for input
- Map request payloads with `#[MapRequestPayload]`
- Never trust request payloads for derived fields

### Error Handling

- Throw domain exceptions in services
- Map exceptions to HTTP responses via an `ExceptionListener`/`kernel.exception` subscriber
- Never expose internal errors to clients

### Code Style

- No emojis in code or comments
- Max line length: 120 characters
- Controllers are thin; services and handlers hold business logic

## File Structure

```
src/
  Controller/
  Dto/
  Entity/
  EventSubscriber/
  Exception/
  Message/
  MessageHandler/
  Repository/
  Security/
  Service/
  Validator/
config/
migrations/
tests/
```

## Key Patterns

### Service Layer

```php
<?php

declare(strict_types=1);

final class CreateOrderHandler
{
    public function __construct(private OrderRepository $orders) {}

    public function handle(CreateOrderDto $data): Order
    {
        return $this->orders->create($data);
    }
}

final class OrderService
{
    public function __construct(private CreateOrderHandler $createOrder) {}

    public function placeOrder(CreateOrderDto $data): Order
    {
        return $this->createOrder->handle($data);
    }
}
```

### Controller Pattern

```php
<?php

declare(strict_types=1);

use Symfony\Component\Routing\Attribute\Route;

final class OrdersController extends AbstractController
{
    public function __construct(private OrderService $service) {}

    #[Route('/api/orders', name: 'orders_store', methods: ['POST'])]
    public function store(#[MapRequestPayload] StoreOrderDto $dto): JsonResponse
    {
        $order = $this->service->placeOrder($dto->toCreateOrderDto($this->getUser()));

        return $this->json([
            'success' => true,
            'data' => $order,
            'error' => null,
            'meta' => null,
        ], Response::HTTP_CREATED, [], ['groups' => 'order:read']);
    }
}
```

### Voter Pattern

```php
<?php

declare(strict_types=1);

use Symfony\Component\Security\Core\Authorization\Voter\Voter;

final class OrderVoter extends Voter
{
    public const VIEW = 'ORDER_VIEW';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return $attribute === self::VIEW && $subject instanceof Order;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();

        return $user instanceof User && $subject->getUserId() === $user->getId();
    }
}
```

### DTO + Validation

```php
<?php

declare(strict_types=1);

final class StoreOrderDto
{
    #[Assert\NotBlank]
    #[Assert\Count(min: 1)]
    public array $items = [];

    public function toCreateOrderDto(User $user): CreateOrderDto
    {
        return new CreateOrderDto(userId: $user->getId(), items: $this->items);
    }
}
```

### Serializer Groups

```php
<?php

declare(strict_types=1);

use Symfony\Component\Serializer\Attribute\Groups;

final class Order
{
    #[Groups(['order:read'])]
    private int $id;

    #[Groups(['order:read'])]
    private string $status;

    #[Groups(['order:read'])]
    private int $totalCents;

    #[Groups(['order:read'])]
    public function getCreatedAtIso(): string
    {
        return $this->createdAt->format(\DateTimeInterface::ATOM);
    }
}
```

### Messenger Message + Handler

```php
<?php

declare(strict_types=1);

final class SendOrderConfirmation
{
    public function __construct(public readonly int $orderId) {}
}

#[AsMessageHandler]
final class SendOrderConfirmationHandler
{
    public function __construct(private OrderRepository $orders, private OrderMailer $mailer) {}

    public function __invoke(SendOrderConfirmation $message): void
    {
        $order = $this->orders->findOrFail($message->orderId);
        $this->mailer->sendOrderConfirmation($order);
    }
}
```

### Test Pattern (PHPUnit + Foundry)

```php
<?php

declare(strict_types=1);

use App\Factory\UserFactory;
use App\Tests\ApiTestCase;
use Zenstruck\Foundry\Test\ResetDatabase;

final class OrdersControllerTest extends ApiTestCase
{
    use ResetDatabase;

    public function testUserCanPlaceOrder(): void
    {
        $client = static::createClient();
        $user = UserFactory::createOne();
        $client->loginUser($user->object());

        $client->jsonRequest('POST', '/api/orders', [
            'items' => [['sku' => 'sku-1', 'quantity' => 2]],
        ]);

        self::assertResponseStatusCodeSame(201);
        self::assertNotNull(
            self::getContainer()->get(OrderRepository::class)->findOneBy(['userId' => $user->getId()])
        );
    }
}
```