---
name: symfony-patterns
description: Symfony architecture patterns, routing/controllers, Doctrine ORM, service layers, Messenger, EventDispatcher, caching, and API Platform/Serializer for production apps. Use when building or reviewing Symfony apps — controllers, Doctrine, service layers, Messenger, or API responses.
metadata:
  origin: ECC
---

# Symfony Development Patterns

Production-grade Symfony architecture patterns for scalable, maintainable applications.

## When to Use

- Building Symfony web applications or APIs
- Structuring controllers, services, and domain logic
- Working with Doctrine entities and relationships
- Designing APIs with the Serializer/API Platform and pagination
- Adding Messenger (async), EventDispatcher, caching, and background jobs

## How It Works

- Structure the app around clear boundaries (controllers -> services/handlers -> Doctrine entities).
- Favor constructor autowiring and explicit service definitions over service-locator lookups; still enforce authorization for access control.
- Favor typed entities, Doctrine custom types/enums, and repository methods to keep domain logic consistent.
- Keep IO-heavy work in Messenger handlers and cache expensive reads.
- Centralize config in `config/packages/*.yaml` and keep environments explicit via `.env`/`.env.local`.

## Examples

### Project Structure

Use a conventional Symfony layout with clear layer boundaries (HTTP, services/handlers, entities).

### Recommended Layout

```
src/
├── Controller/
│   └── Api/
├── Dto/              # Request/response DTOs
├── Entity/
├── EventSubscriber/
├── Exception/
├── Message/          # Messenger async messages
├── MessageHandler/
├── Repository/
├── Security/         # Voters, authenticators
├── Service/          # Coordinating domain services
└── Validator/         # Custom constraints
config/
├── packages/
├── routes/
└── services.yaml
migrations/
templates/
tests/
```

### Controllers -> Services -> Handlers

Keep controllers thin. Put orchestration in services and single-purpose logic in invokable handlers.

```php
final class CreateOrderHandler
{
    public function __construct(private OrderRepository $orders) {}

    public function handle(CreateOrderDto $data): Order
    {
        return $this->orders->create($data);
    }
}

final class OrdersController extends AbstractController
{
    public function __construct(private CreateOrderHandler $createOrder) {}

    #[Route('/api/orders', name: 'orders_store', methods: ['POST'])]
    public function store(#[MapRequestPayload] CreateOrderDto $dto): JsonResponse
    {
        $order = $this->createOrder->handle($dto);

        return $this->json([
            'success' => true,
            'data' => $order,
            'error' => null,
            'meta' => null,
        ], Response::HTTP_CREATED, [], ['groups' => 'order:read']);
    }
}
```

### Routing and Controllers

Prefer attribute routing and one controller (or invokable action class) per endpoint for clarity.

```php
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/projects', name: 'projects_')]
final class ProjectController extends AbstractController
{
    #[Route('', name: 'index', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function index(ProjectRepository $projects): JsonResponse
    {
        return $this->json($projects->findAll(), context: ['groups' => 'project:read']);
    }

    #[Route('/{project}', name: 'show', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function show(Project $project): JsonResponse
    {
        return $this->json($project, context: ['groups' => 'project:read']);
    }
}
```

### Entity Parameter Resolution (Scoped)

Symfony's `ParamConverter`/`#[MapEntity]` auto-resolves route parameters to entities. Scope the query explicitly to prevent cross-tenant access instead of relying on the raw primary key alone.

```php
use Symfony\Bridge\Doctrine\Attribute\MapEntity;

#[Route('/accounts/{account}/projects/{project}', name: 'accounts_projects_show')]
public function show(
    Account $account,
    #[MapEntity(expr: 'repository.findOneByAccountAndId(account, project)')] Project $project,
): JsonResponse {
    // $project is guaranteed to belong to $account
}
```

### Nested Routes and Parameter Names

- Keep prefixes and paths consistent to avoid double nesting (e.g., `conversation` vs `conversations`).
- Use a single parameter name that matches the resolved entity (e.g., `{conversation}` for `Conversation`).
- Prefer an explicit `#[MapEntity]` expression when nesting, to enforce parent-child relationships.

```php
use Symfony\Component\Routing\Attribute\Route;

#[Route('/conversations', name: 'conversations_')]
final class ConversationController extends AbstractController
{
    #[Route('', name: 'store', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function store(#[MapRequestPayload] CreateConversationDto $dto): JsonResponse { /* ... */ }

    #[Route('/{conversation}', name: 'show', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function show(Conversation $conversation): JsonResponse { /* ... */ }

    #[Route('/{conversation}/messages', name: 'messages_store', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function storeMessage(Conversation $conversation, #[MapRequestPayload] CreateMessageDto $dto): JsonResponse { /* ... */ }
}
```

### Service Wiring

Symfony autowires by type-hint by default. Bind an interface to a concrete implementation explicitly in `config/services.yaml` when there's more than one candidate.

```yaml
# config/services.yaml
services:
    App\Repository\OrderRepositoryInterface:
        alias: App\Repository\DoctrineOrderRepository
```

### Doctrine Entity Patterns

### Entity Configuration

```php
#[ORM\Entity(repositoryClass: ProjectRepository::class)]
final class Project
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false)]
    private User $owner;

    #[ORM\Column(enumType: ProjectStatus::class)]
    private ProjectStatus $status;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $archivedAt = null;
}
```

### Enums and Value Objects

Use native PHP backed enums for Doctrine `enumType` columns, and small value objects for money, identifiers, and other constrained concepts.

```php
enum ProjectStatus: string
{
    case Draft = 'draft';
    case Active = 'active';
    case Archived = 'archived';
}
```

```php
final class Money
{
    private function __construct(private readonly int $cents) {}

    public static function fromCents(int $cents): self
    {
        return new self($cents);
    }

    public function toCents(): int
    {
        return $this->cents;
    }
}
```

### Eager Loading to Avoid N+1

```php
$orders = $this->createQueryBuilder('o')
    ->addSelect('customer', 'items', 'product')
    ->join('o.customer', 'customer')
    ->join('o.items', 'items')
    ->join('items.product', 'product')
    ->orderBy('o.createdAt', 'DESC')
    ->getQuery()
    ->setMaxResults(25)
    ->getResult();
```

### Repository Methods for Complex Filters

Keep filtering logic in the repository, not in controllers or entities.

```php
final class ProjectRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Project::class);
    }

    public function ownedByAndActive(User $user): array
    {
        return $this->createQueryBuilder('p')
            ->andWhere('p.owner = :owner')
            ->andWhere('p.archivedAt IS NULL')
            ->setParameter('owner', $user)
            ->getQuery()
            ->getResult();
    }
}
```

### Soft Deletes and Query-Time Filtering

Doctrine has no built-in soft-delete equivalent to Eloquent's global scopes. Use a `deletedAt`/`archivedAt` column plus either a Doctrine `SQLFilter` (enabled per request) or explicit repository methods, not both, unless layered behavior is intended.

```php
final class SoftDeleteableFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, $targetTableAlias): string
    {
        if (!$targetEntity->hasField('deletedAt')) {
            return '';
        }

        return sprintf('%s.deleted_at IS NULL', $targetTableAlias);
    }
}
```

### Transactions for Multi-Step Updates

```php
$this->entityManager->wrapInTransaction(function (EntityManagerInterface $em) use ($order): void {
    $order->markPaid();
    foreach ($order->getItems() as $item) {
        $item->markPaid();
    }
    $em->flush();
});
```

### Migrations

### Naming Convention

- Generated by `bin/console make:migration`; files are versioned classes named `VersionYYYYMMDDHHMMSS.php`.
- Each migration is a class with `up(Schema $schema)` and `down(Schema $schema)`.

### Example Migration

```php
final class Version20250314154210 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE orders (
            id INT AUTO_INCREMENT NOT NULL,
            customer_id INT NOT NULL,
            status VARCHAR(32) NOT NULL,
            total_cents INT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX IDX_customer (customer_id),
            INDEX IDX_status (status),
            PRIMARY KEY(id)
        )');
        $this->addSql('ALTER TABLE orders ADD CONSTRAINT FK_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE orders');
    }
}
```

### DTOs and Validation

Map and validate incoming payloads with `#[MapRequestPayload]` and Symfony Validator constraints; transform to domain DTOs before they reach services.

```php
final class CreateOrderDto
{
    #[Assert\NotBlank]
    #[Assert\Positive]
    public int $customerId;

    #[Assert\NotBlank]
    #[Assert\Count(min: 1)]
    public array $items = [];
}
```

### API Responses (Serializer)

Keep API responses consistent using the Serializer component and normalization groups; use API Platform when you need generated CRUD resources instead of hand-written controllers.

```php
#[Route('/api/projects', methods: ['GET'])]
public function index(ProjectRepository $projects, PaginatorInterface $paginator, Request $request): JsonResponse
{
    $pagination = $paginator->paginate(
        $projects->activeQuery(),
        $request->query->getInt('page', 1),
        25,
    );

    return $this->json([
        'success' => true,
        'data' => $pagination->getItems(),
        'error' => null,
        'meta' => [
            'page' => $pagination->getCurrentPageNumber(),
            'per_page' => $pagination->getItemNumberPerPage(),
            'total' => $pagination->getTotalItemCount(),
        ],
    ], context: ['groups' => 'project:read']);
}
```

### Events, Messenger, and Async Jobs

- Dispatch domain events via `EventDispatcherInterface` for side effects (emails, analytics).
- Use Messenger message/handler pairs for slow work (reports, exports, webhooks) routed to an async transport.
- Prefer idempotent handlers; configure retry strategy per transport in `config/packages/messenger.yaml`.

### Caching

- Cache read-heavy endpoints and expensive queries with the Symfony Cache component (`CacheInterface`/`TagAwareCacheInterface`).
- Invalidate caches on Doctrine lifecycle events (`postPersist`/`postUpdate`/`postRemove`) or explicit cache tags.
- Use cache tags when caching related data for easy invalidation.

### Configuration and Environments

- Keep secrets in the Symfony secrets vault (`bin/console secrets:set`) or environment variables, and config in `config/packages/*.yaml`.
- Use per-environment config overrides (`config/packages/prod/*.yaml`) and `bin/console cache:warmup --env=prod` before deploying.