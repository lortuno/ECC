---
name: symfony-tdd
description: Symfony testing strategies with PHPUnit, Foundry factories, functional HTTP tests, JWT/API token authentication testing, mocking, and coverage. Use when writing Symfony tests with PHPUnit, or driving a Symfony feature test-first.
metadata:
  origin: ECC
---

# Symfony Testing with TDD

Test-driven development for Symfony applications using PHPUnit, Foundry factories, and the Symfony test client.

## When to Activate

- Writing new Symfony applications or features
- Implementing API endpoints with JWT or API Platform authentication
- Testing Doctrine entities, relationships, and repository queries
- Setting up testing infrastructure for Symfony projects
- Writing functional tests for HTTP controllers and DTO validation
- Mocking external services (HTTP clients, mailer, Messenger, events)

## TDD Workflow for Symfony

### Red-Green-Refactor Cycle

```php
// Step 1: RED — Write a failing test
public function testAProductCanBeCreated(): void
{
    $product = ProductFactory::createOne(['name' => 'Test Product']);
    self::assertNotNull($product->getId());
}

// Step 2: GREEN — Write the migration, entity, and factory
// Step 3: REFACTOR — Improve while keeping tests green
```

## Setup

### PHPUnit Configuration

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true">
    <testsuites>
        <testsuite name="Unit">
            <directory suffix="Test.php">tests/Unit</directory>
        </testsuite>
        <testsuite name="Functional">
            <directory suffix="Test.php">tests/Functional</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_ENV" value="test" force="true"/>
        <env name="KERNEL_CLASS" value="App\Kernel"/>
        <env name="DATABASE_URL" value="sqlite:///:memory:"/>
        <env name="MAILER_DSN" value="null://null"/>
        <env name="MESSENGER_TRANSPORT_DSN" value="in-memory://"/>
    </php>
</phpunit>
```

Install the test pack and Foundry:

```bash
composer require --dev symfony/test-pack zenstruck/foundry
```

### Base TestCase Setup

```php
namespace App\Tests;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

abstract class ApiTestCase extends WebTestCase
{
    protected function loginAsUser(): User
    {
        $client = static::getClient() ?? static::createClient();
        $user = UserFactory::createOne()->object();
        $client->loginUser($user);
        return $user;
    }

    protected function loginAsAdmin(): User
    {
        $client = static::getClient() ?? static::createClient();
        $admin = UserFactory::new()->admin()->create()->object();
        $client->loginUser($admin);
        return $admin;
    }
}
```

## Foundry Factories

```php
// src/Factory/UserFactory.php
final class UserFactory extends PersistentProxyObjectFactory
{
    public static function class(): string
    {
        return User::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'name' => self::faker()->name(),
            'email' => self::faker()->unique()->safeEmail(),
            'password' => 'hashed-in-postInstantiate',
            'role' => 'user',
        ];
    }

    protected function initialize(): static
    {
        return $this
            ->afterInstantiate(function (User $user): void {
                // hash password via PasswordHasherInterface here
            });
    }

    public function admin(): static
    {
        return $this->with(['role' => 'admin']);
    }

    public function unverified(): static
    {
        return $this->with(['emailVerifiedAt' => null]);
    }
}

// src/Factory/ProductFactory.php
final class ProductFactory extends PersistentProxyObjectFactory
{
    public static function class(): string
    {
        return Product::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'name' => self::faker()->unique()->words(3, true),
            'description' => self::faker()->paragraph(),
            'priceCents' => self::faker()->numberBetween(100, 100000),
            'stock' => self::faker()->numberBetween(0, 100),
            'isActive' => true,
            'owner' => UserFactory::new(),
        ];
    }

    public function outOfStock(): static
    {
        return $this->with(['stock' => 0]);
    }
}
```

### Using Factories

```php
$user = UserFactory::createOne();
$admin = UserFactory::new()->admin()->create();
$product = ProductFactory::createOne(['owner' => $user]);
$products = ProductFactory::createMany(10);
$draft = ProductFactory::new()->withoutPersisting()->create(); // not persisted

// With relationships
$user = UserFactory::createOne(['products' => ProductFactory::new()->many(3)]);

// Sequences
ProductFactory::createSequence([
    ['isActive' => true], ['isActive' => true], ['isActive' => false],
]);
```

## Entity Testing

```php
namespace App\Tests\Unit\Entity;

use App\Factory\ProductFactory;
use App\Factory\UserFactory;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Zenstruck\Foundry\Test\ResetDatabase;

final class UserTest extends KernelTestCase
{
    use ResetDatabase;

    public function testItHidesSensitiveAttributesFromSerialization(): void
    {
        $user = UserFactory::createOne();
        $normalized = self::getContainer()->get('serializer')->normalize($user->object(), context: ['groups' => 'user:read']);
        self::assertArrayNotHasKey('password', $normalized);
    }

    public function testAdminRepositoryQueryReturnsOnlyAdmins(): void
    {
        UserFactory::new()->admin()->create();
        UserFactory::createMany(3);

        self::assertCount(1, self::getContainer()->get(UserRepository::class)->findAdmins());
    }
}

final class ProductTest extends KernelTestCase
{
    use ResetDatabase;

    public function testActiveRepositoryQueryFiltersCorrectly(): void
    {
        ProductFactory::createMany(3, ['isActive' => true]);
        ProductFactory::createMany(2, ['isActive' => false]);

        self::assertCount(3, self::getContainer()->get(ProductRepository::class)->findActive());
    }

    public function testItBelongsToAUser(): void
    {
        $user = UserFactory::createOne();
        $product = ProductFactory::createOne(['owner' => $user]);

        self::assertSame($user->object(), $product->getOwner());
    }
}
```

## Functional / HTTP Testing

```php
namespace App\Tests\Functional\Controller;

use App\Factory\ProductFactory;
use App\Factory\UserFactory;
use App\Tests\ApiTestCase;
use Zenstruck\Foundry\Test\ResetDatabase;

final class ProductControllerTest extends ApiTestCase
{
    use ResetDatabase;

    public function testGuestsAreRedirectedToLogin(): void
    {
        $client = static::createClient();
        $client->request('GET', '/products/create');
        self::assertResponseRedirects('/login');
    }

    public function testItStoresANewProduct(): void
    {
        $client = static::createClient();
        $user = $this->loginAsUser();

        $client->request('POST', '/products', [
            'name' => 'New Product',
            'description' => 'Description',
            'priceCents' => 2999,
            'stock' => 10,
        ]);

        self::assertResponseRedirects('/products');
        self::assertNotNull(
            self::getContainer()->get(ProductRepository::class)->findOneBy(['name' => 'New Product', 'owner' => $user])
        );
    }

    public function testItValidatesRequiredFields(): void
    {
        $client = static::createClient();
        $this->loginAsUser();

        $client->request('POST', '/products', []);
        self::assertResponseStatusCodeSame(422);
    }

    public function testUsersCannotModifyOthersProducts(): void
    {
        $client = static::createClient();
        $owner = UserFactory::createOne();
        $product = ProductFactory::createOne(['owner' => $owner]);
        $this->loginAsUser(); // a different user

        $client->request('DELETE', "/products/{$product->getId()}");
        self::assertResponseStatusCodeSame(403);
    }
}
```

## JSON API Testing

```php
namespace App\Tests\Functional\Controller\Api;

use App\Factory\ProductFactory;
use App\Factory\UserFactory;
use App\Tests\ApiTestCase;
use Zenstruck\Foundry\Test\ResetDatabase;

final class ProductApiTest extends ApiTestCase
{
    use ResetDatabase;

    public function testUnauthenticatedRequestsAreRejected(): void
    {
        $client = static::createClient();
        $client->request('GET', '/api/products');
        self::assertResponseStatusCodeSame(401);
    }

    public function testItListsPaginatedProducts(): void
    {
        $client = static::createClient();
        $user = $this->loginAsUser();
        ProductFactory::createMany(5, ['owner' => $user]);

        $client->request('GET', '/api/products');

        self::assertResponseIsSuccessful();
        $data = json_decode($client->getResponse()->getContent(), true);
        self::assertCount(5, $data['data']);
        self::assertArrayHasKey('total', $data['meta']);
    }

    public function testItCreatesAProduct(): void
    {
        $client = static::createClient();
        $this->loginAsUser();

        $client->jsonRequest('POST', '/api/products', ['name' => 'API Product', 'priceCents' => 4999]);

        self::assertResponseStatusCodeSame(201);
        self::assertJsonStringEqualsJsonString(
            '{"name":"API Product"}',
            json_encode(['name' => json_decode($client->getResponse()->getContent(), true)['data']['name']])
        );
    }

    public function testUsersCannotDeleteOthersProducts(): void
    {
        $client = static::createClient();
        $owner = UserFactory::createOne();
        $product = ProductFactory::createOne(['owner' => $owner]);
        $this->loginAsUser();

        $client->request('DELETE', "/api/products/{$product->getId()}");
        self::assertResponseStatusCodeSame(403);
    }
}
```

## JWT / API Token Auth Testing

```php
namespace App\Tests\Functional\Controller\Api;

use App\Factory\UserFactory;
use App\Tests\ApiTestCase;
use Zenstruck\Foundry\Test\ResetDatabase;

final class AuthControllerTest extends ApiTestCase
{
    use ResetDatabase;

    public function testUsersCanRegister(): void
    {
        $client = static::createClient();

        $client->jsonRequest('POST', '/api/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'Password123!',
        ]);

        self::assertResponseStatusCodeSame(201);
        $data = json_decode($client->getResponse()->getContent(), true);
        self::assertArrayHasKey('token', $data['data']);
    }

    public function testUsersCanLogin(): void
    {
        $client = static::createClient();
        UserFactory::createOne(['email' => 'test@example.com', 'password' => 'Password123!']);

        $client->jsonRequest('POST', '/api/login', [
            'email' => 'test@example.com',
            'password' => 'Password123!',
        ]);

        self::assertResponseIsSuccessful();
        self::assertArrayHasKey('token', json_decode($client->getResponse()->getContent(), true)['data']);
    }

    public function testUsersCannotLoginWithWrongPassword(): void
    {
        $client = static::createClient();
        UserFactory::createOne(['email' => 'test@example.com']);

        $client->jsonRequest('POST', '/api/login', ['email' => 'test@example.com', 'password' => 'wrong']);
        self::assertResponseStatusCodeSame(401);
    }

    public function testBearerTokenAuthenticatesRequests(): void
    {
        $client = static::createClient();
        $user = UserFactory::createOne();
        $token = self::getContainer()->get('lexik_jwt_authentication.jwt_manager')->create($user->object());

        $client->request('GET', '/api/me', server: ['HTTP_AUTHORIZATION' => "Bearer {$token}"]);

        self::assertResponseIsSuccessful();
        self::assertSame($user->getEmail(), json_decode($client->getResponse()->getContent(), true)['data']['email']);
    }
}
```

## Mocking and Fakes

### HTTP Client Mock

```php
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

public function testItHandlesSuccessfulPayment(): void
{
    $mockClient = new MockHttpClient([
        new MockResponse(json_encode(['id' => 'pi_123', 'status' => 'succeeded'])),
    ]);

    $result = (new PaymentService($mockClient))->charge(2999);
    self::assertTrue($result->success);
}

public function testItHandlesGatewayFailure(): void
{
    $mockClient = new MockHttpClient([
        new MockResponse(json_encode(['error' => 'card_declined']), ['http_code' => 402]),
    ]);

    $this->expectException(PaymentFailedException::class);
    (new PaymentService($mockClient))->charge(2999);
}
```

### Mailer Assertions

```php
use Symfony\Bundle\FrameworkBundle\Test\MailerAssertionsTrait;

final class OrderConfirmationTest extends KernelTestCase
{
    use MailerAssertionsTrait;

    public function testItSendsConfirmationEmail(): void
    {
        $order->sendConfirmation();

        self::assertQueuedEmailCount(1);
        $email = self::getMailerMessage();
        self::assertEmailHtmlBodyContains($email, $order->getReference());
    }
}
```

### Messenger (In-Memory Transport)

```php
use Symfony\Component\Messenger\Transport\InMemory\InMemoryTransport;

public function testItDispatchesProcessImageMessage(): void
{
    $transport = self::getContainer()->get('messenger.transport.async');
    // $transport is an InMemoryTransport in the test environment

    $messageBus->dispatch(new ProcessImage($product->getId()));

    self::assertCount(1, $transport->getSent());
}
```

### Event Dispatch Assertions

```php
final class TraceableEventDispatcherTest extends KernelTestCase
{
    public function testItDispatchesOrderShipped(): void
    {
        self::bootKernel();
        $dispatcher = self::getContainer()->get('event_dispatcher');
        $dispatched = [];
        $dispatcher->addListener(OrderShipped::class, function (OrderShipped $event) use (&$dispatched): void {
            $dispatched[] = $event;
        });

        $order->markAsShipped();

        self::assertCount(1, $dispatched);
    }
}
```

## Console Command Tests

```php
use Symfony\Component\Console\Tester\CommandTester;

public function testItSendsNewsletters(): void
{
    UserFactory::createMany(5, ['subscribed' => true]);

    $tester = new CommandTester(static::getContainer()->get(SendNewsletterCommand::class));
    $tester->execute([]);

    $tester->assertCommandIsSuccessful();
    self::assertStringContainsString('Sending newsletter to 5 subscribers', $tester->getDisplay());
}

public function testItHandlesNoSubscribers(): void
{
    $tester = new CommandTester(static::getContainer()->get(SendNewsletterCommand::class));
    $tester->execute([]);

    self::assertStringContainsString('No subscribers found.', $tester->getDisplay());
}
```

## Authorization Tests

```php
public function testUsersCanUpdateOwnPosts(): void
{
    $client = static::createClient();
    $user = $this->loginAsUser();
    $post = PostFactory::createOne(['owner' => $user]);

    $client->request('PUT', "/posts/{$post->getId()}", ['title' => 'Updated']);
    self::assertResponseRedirects();
}

public function testUsersCannotUpdateOthersPosts(): void
{
    $client = static::createClient();
    $post = PostFactory::createOne();
    $this->loginAsUser();

    $client->request('PUT', "/posts/{$post->getId()}", ['title' => 'Hacked']);
    self::assertResponseStatusCodeSame(403);
}

public function testSuperAdminVoterGrantsFullAccess(): void
{
    $client = static::createClient();
    $super = UserFactory::new()->superAdmin()->create();
    $client->loginUser($super->object());
    $post = PostFactory::createOne();

    $client->request('DELETE', "/posts/{$post->getId()}");
    self::assertResponseRedirects();
}
```

## Coverage

```bash
# PHPUnit (use clover output for CI threshold checks)
vendor/bin/phpunit --coverage-html coverage --coverage-clover clover.xml

# With a minimum threshold enforced separately (phpunit has no built-in --min flag)
XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text --coverage-clover clover.xml
```

### Coverage Goals

| Component | Target |
|-----------|--------|
| Entities | 95%+ |
| Services/Handlers | 90%+ |
| DTOs/Validators | 90%+ |
| Controllers | 85%+ |
| Voters | 95%+ |
| Overall | 80%+ |

## Testing Best Practices

### DO

- Use Foundry factories over manual `new Entity()` + `persist()` calls
- One logical assertion per test
- Descriptive names: `testGuestsCannotCreateProducts`
- Test edge cases and authorization boundaries
- Mock external services with `MockHttpClient`, `MailerAssertionsTrait`, in-memory Messenger transports
- Use `ResetDatabase` (Foundry) for clean state between tests

### DON'T

- Don't test framework internals (trust Symfony/Doctrine)
- Don't make tests dependent on each other
- Don't over-mock — mock only service boundaries
- Don't test private methods — test through the public interface
- Don't couple tests to HTML/Twig structure

## Quick Reference

| Pattern | Usage |
|---------|-------|
| `ResetDatabase` (Foundry) | Reset database between tests |
| `$client->loginUser($user)` | Authenticate as user in a functional test |
| `HTTP_AUTHORIZATION: Bearer <token>` | Bearer token auth for APIs |
| `Factory::createOne()` | Create entity with a Foundry factory |
| `Factory::createMany(5)` | Create multiple records |
| `MockHttpClient([...])` | Mock outbound HTTP calls |
| `MailerAssertionsTrait` | Trap and assert sent mail |
| `InMemoryTransport` (Messenger) | Trap dispatched async messages |
| `CommandTester` | Test console commands |
| `assertResponseIsSuccessful` | Assert 2xx status |
| `assertResponseStatusCodeSame(403)` | Assert a specific status |
| `assertResponseRedirects` | Assert redirect response |

## Related Skills

- `symfony-patterns` — Symfony architecture, Doctrine, routing, and API patterns
- `symfony-security` — Symfony authentication, authorization, and secure coding
- `tdd-workflow` — The repo-wide RED -> GREEN -> REFACTOR loop
- `backend-patterns` — General backend API and database patterns