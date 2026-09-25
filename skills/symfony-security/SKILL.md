---
name: symfony-security
description: Symfony security best practices — authentication, authorization, Doctrine safety, CSRF, XSS prevention, API security, and secure deployment configurations. Use when reviewing Symfony auth, Doctrine safety, CSRF, XSS, API security, or deployment configuration.
metadata:
  origin: ECC
---

# Symfony Security Best Practices

Comprehensive security guidelines for Symfony applications to protect against common vulnerabilities.

## When to Activate

- Setting up Symfony authentication and authorization (Security component, LexikJWTAuthenticationBundle, API Platform)
- Implementing user roles, voters, and access control
- Configuring production security settings and environment variables
- Reviewing Symfony applications for security vulnerabilities
- Deploying Symfony applications to production
- Writing secure Doctrine queries and migrations

## Production Configuration

### Essential Production Settings

```yaml
# .env / .env.local (never committed)
APP_ENV=prod
APP_DEBUG=0 # CRITICAL: Never true/1 in production
APP_SECRET= # Must be set: a random 32+ char string
```

```php
// Verify APP_SECRET is set at boot, e.g. in a compiler pass or health check
if (empty($_ENV['APP_SECRET'] ?? null)) {
    throw new \RuntimeException('APP_SECRET is not set.');
}
```

```yaml
# config/packages/framework.yaml
framework:
    session:
        cookie_secure: auto   # true behind HTTPS
        cookie_httponly: true
        cookie_samesite: lax
```

### Environment File Security

```bash
# NEVER commit .env.local to version control
# .gitignore already includes .env.local by default

# Use .env with safe defaults, .env.local.php or a secret manager for real values
DATABASE_URL=
APP_SECRET=
JWT_PASSPHRASE=

# Prefer the Symfony secrets vault over plain env files for production secrets
bin/console secrets:set APP_SECRET
bin/console secrets:set DATABASE_PASSWORD
```

### HTTPS Enforcement

```yaml
# config/packages/framework.yaml
framework:
    trusted_proxies: '10.0.0.0/8,172.16.0.0/12' # load balancers — never '*', it allows X-Forwarded-* spoofing
    trusted_headers: ['x-forwarded-for', 'x-forwarded-proto']
```

```php
// A RequestListener/subscriber can force HTTPS in production
final class ForceHttpsSubscriber implements EventSubscriberInterface
{
    public function __construct(private string $env) {}

    public function onKernelRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();
        if ($this->env === 'prod' && !$request->isSecure()) {
            $event->setResponse(new RedirectResponse('https://' . $request->getHttpHost() . $request->getRequestUri()));
        }
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => 'onKernelRequest'];
    }
}
```

## Authentication

### API Token Authentication (LexikJWTAuthenticationBundle)

```yaml
# config/packages/security.yaml
security:
    firewalls:
        api:
            pattern: ^/api
            stateless: true
            jwt: ~

    access_control:
        - { path: ^/api/login, roles: PUBLIC_ACCESS }
        - { path: ^/api, roles: IS_AUTHENTICATED_FULLY }
```

```yaml
# config/packages/lexik_jwt_authentication.yaml
lexik_jwt_authentication:
    secret_key: '%env(resolve:JWT_SECRET_KEY)%'
    public_key: '%env(resolve:JWT_PUBLIC_KEY)%'
    pass_phrase: '%env(JWT_PASSPHRASE)%'
    token_ttl: 3600
```

```php
// Issuing tokens with scopes/abilities via custom claims
$token = $jwtManager->createFromPayload($user, [
    'abilities' => ['orders:read', 'orders:write'],
]);
```

```php
// Validate abilities inside a voter or controller
#[IsGranted('ORDERS_READ')]
#[Route('/api/orders', methods: ['GET'])]
public function index(): JsonResponse { /* ... */ }
```

### Password Security

```yaml
# config/packages/security.yaml
security:
    password_hashers:
        App\Entity\User:
            algorithm: auto # bcrypt/argon2id depending on platform support
```

```php
// Password validation via Symfony Validator
final class RegisterDto
{
    #[Assert\NotBlank]
    #[Assert\Length(min: 12)]
    #[Assert\Regex(
        pattern: '/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/',
        message: 'Password must include upper, lower, number, and symbol.',
    )]
    public string $password;
}
```

```php
// Rate limit login attempts — config/packages/rate_limiter.yaml
// framework:
//   rate_limiter:
//     login: { policy: 'sliding_window', limit: 5, interval: '1 minute' }

final class LoginRateLimitSubscriber
{
    public function __construct(private RateLimiterFactory $loginLimiter) {}

    public function checkLoginAttempt(string $ip): void
    {
        $limiter = $this->loginLimiter->create($ip);
        if (!$limiter->consume(1)->isAccepted()) {
            throw new TooManyLoginAttemptsAuthenticationException();
        }
    }
}
```

### Session Management

```yaml
# config/packages/framework.yaml
framework:
    session:
        handler_id: Redis\Session\Handler # database/redis > native file handler
        cookie_lifetime: 7200
        cookie_secure: auto
```

```php
// Regenerate session on login (invalidate + issue new ID: prevents session fixation)
final class LoginSuccessSubscriber implements EventSubscriberInterface
{
    public function onLoginSuccess(LoginSuccessEvent $event): void
    {
        $event->getRequest()->getSession()->migrate(true);
    }

    public static function getSubscribedEvents(): array
    {
        return [LoginSuccessEvent::class => 'onLoginSuccess'];
    }
}

// Invalidate session on logout
final class LogoutSubscriber implements EventSubscriberInterface
{
    public function onLogout(LogoutEvent $event): void
    {
        $event->getRequest()->getSession()->invalidate();
    }

    public static function getSubscribedEvents(): array
    {
        return [LogoutEvent::class => 'onLogout'];
    }
}
```

## Authorization

### Voters

```php
final class PostVoter extends Voter
{
    public const UPDATE = 'POST_UPDATE';
    public const DELETE = 'POST_DELETE';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return in_array($attribute, [self::UPDATE, self::DELETE], true) && $subject instanceof Post;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        // Super-admin override
        if (in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true)) {
            return true;
        }

        return match ($attribute) {
            self::UPDATE => $subject->getOwner() === $user,
            self::DELETE => $subject->getOwner() === $user
                && $subject->getCreatedAt() > new \DateTimeImmutable('-30 days'),
            default => false,
        };
    }
}

// Controller usage
#[IsGranted(PostVoter::UPDATE, subject: 'post')]
#[Route('/posts/{post}', methods: ['PUT'])]
public function update(Post $post): Response { /* ... */ }

// Or explicit check
$this->denyAccessUnlessGranted(PostVoter::UPDATE, $post);
```

### Role Hierarchy

```yaml
# config/packages/security.yaml
security:
    role_hierarchy:
        ROLE_ADMIN: ROLE_USER
        ROLE_SUPER_ADMIN: ROLE_ADMIN
```

### Twig Usage

```twig
{% if is_granted('POST_UPDATE', post) %}
    <a href="{{ path('posts_edit', {id: post.id}) }}">Edit</a>
{% else %}
    <span>You cannot edit this post</span>
{% endif %}
```

### Firewall/Access-Control Authorization

```yaml
# config/packages/security.yaml
security:
    access_control:
        - { path: ^/admin, roles: ROLE_ADMIN }
        - { path: ^/api, roles: IS_AUTHENTICATED_FULLY }
```

## Doctrine Security

### Over-Posting / Mass-Assignment Protection

```php
// BAD: denormalizing the raw request body straight onto the entity
$user = $serializer->deserialize($request->getContent(), User::class, 'json');
// This can set ANY mapped property, including role/isAdmin, if present in the payload.

// GOOD: denormalize into a DTO with only the writable fields
final class UpdateUserDto
{
    #[Assert\NotBlank]
    public string $name;

    #[Assert\Email]
    public string $email;
    // NEVER add 'roles', 'isAdmin', 'isVerified' here
}

#[Route('/api/users/{user}', methods: ['PATCH'])]
public function update(User $user, #[MapRequestPayload] UpdateUserDto $dto): JsonResponse
{
    $user->setName($dto->name);
    $user->setEmail($dto->email);
    $this->entityManager->flush();
    // ...
}
```

### SQL Injection Prevention

```php
// GOOD: DQL and QueryBuilder parameterize automatically
$this->createQueryBuilder('u')
    ->andWhere('u.email = :email')
    ->setParameter('email', $userInput)
    ->getQuery()
    ->getOneOrNullResult();

// GOOD: DBAL also parameterizes
$connection->fetchAssociative('SELECT * FROM users WHERE email = ?', [$userInput]);

// BAD: raw string interpolation
$connection->executeQuery("SELECT * FROM users WHERE email = '{$userInput}'"); // VULNERABLE!
$this->createQueryBuilder('u')
    ->andWhere("u.email = '{$userInput}'"); // VULNERABLE!
```

### Attribute-Based Casting

```php
#[ORM\Entity]
final class User
{
    #[ORM\Column]
    private ?\DateTimeImmutable $emailVerifiedAt = null;

    #[ORM\Column]
    private bool $isAdmin = false; // native bool type prevents string injection

    #[ORM\Column(type: Types::JSON)]
    private array $settings = []; // auto (de)serialized as JSON

    #[ORM\Column]
    private string $password; // hash before persisting, never store plaintext
}
```

### Entity Security

```php
#[ORM\Entity]
final class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    // Exclude sensitive properties from API serialization with Serializer groups
    #[Groups(['user:read'])]
    private string $name;

    #[ORM\Column]
    private string $password; // NEVER add a #[Groups] attribute to this

    // Append only safe computed values to serialized output
    #[Groups(['user:read'])]
    public function getFullName(): string { /* safe */ }
}
```

## CSRF Protection

### Default Protection

```twig
{# Symfony CSRF is enabled by default for Form component forms #}
<form method="post" action="{{ path('posts_store') }}">
    <input type="hidden" name="_token" value="{{ csrf_token('post_item') }}">
    <input type="text" name="title">
    <button type="submit">Create</button>
</form>
```

```php
// Server-side check outside the Form component
if (!$this->isCsrfTokenValid('post_item', $request->request->get('_token'))) {
    throw new InvalidCsrfTokenException();
}
```

### Excluding Routes (Carefully)

```yaml
# config/packages/framework.yaml
framework:
    csrf_protection:
        # Stateless API firewalls (JWT/token auth) typically disable form-based
        # CSRF and rely on the bearer token instead — don't disable it globally.
        enabled: true
```

## XSS Prevention

### Twig Templating Security

```twig
{# SAFE: auto-escaped by Twig #}
{{ userInput }}

{# DANGEROUS: raw output — NEVER use with user input #}
{{ userInput|raw }}

{# SAFE: only use |raw with trusted content you control #}
{{ trustedHtmlFromYourServer|raw }}

{# GOOD: encode explicitly for the target context #}
<script>const data = {{ data|json_encode|raw }};</script>

{# BAD: direct user input in raw HTML #}
<div>{{ user.bio|raw }}</div> {# VULNERABLE if user provides bio #}
```

### Safe HTML Handling

```php
// When you must allow some HTML, use a whitelist approach
// composer require ezyang/htmlpurifier

public function sanitizeHtml(string $dirty): string
{
    $config = \HTMLPurifier_Config::createDefault();
    $config->set('HTML.Allowed', 'p,b,i,a[href],ul,ol,li,br');
    $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true, 'mailto' => true]);
    return (new \HTMLPurifier($config))->purify($dirty);
}
```

### HTTP Headers for XSS Protection

```php
// composer require nelmio/security-bundle, or a custom response subscriber
final class SecurityHeadersSubscriber implements EventSubscriberInterface
{
    public function onKernelResponse(ResponseEvent $event): void
    {
        $response = $event->getResponse();
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        );
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => 'onKernelResponse'];
    }
}
```

## Input Validation

### DTO Validation

```php
final class StorePostDto
{
    #[Assert\NotBlank]
    #[Assert\Length(max: 255)]
    public string $title;

    #[Assert\NotBlank]
    #[Assert\Length(max: 10000)]
    public string $content;

    #[Assert\Image(mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], maxSize: '2M')]
    public ?File $image = null;

    #[Assert\All([new Assert\Type('integer')])]
    public array $tags = [];
}

#[Route('/posts', methods: ['POST'])]
#[IsGranted('POST_CREATE')]
public function store(#[MapRequestPayload] StorePostDto $dto): JsonResponse
{
    $dto->title = strip_tags($dto->title);
    // ...
}
```

### Custom Validation Constraints

```php
#[\Attribute]
final class StrongPassword extends Constraint
{
    public string $message = 'The value must be at least 12 characters with uppercase, lowercase, number, and symbol.';
}

final class StrongPasswordValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/', (string) $value)) {
            $this->context->buildViolation($constraint->message)->addViolation();
        }
    }
}
```

## API Security

### Rate Limiting

```yaml
# config/packages/rate_limiter.yaml
framework:
    rate_limiter:
        api:
            policy: 'sliding_window'
            limit: 60
            interval: '1 minute'
        auth:
            policy: 'fixed_window'
            limit: 5
            interval: '1 minute'
        uploads:
            policy: 'token_bucket'
            limit: 10
            interval: '1 hour'
```

```php
final class RateLimitSubscriber implements EventSubscriberInterface
{
    public function __construct(private RateLimiterFactory $apiLimiter) {}

    public function onKernelRequest(RequestEvent $event): void
    {
        $limiter = $this->apiLimiter->create($event->getRequest()->getClientIp());
        $limit = $limiter->consume(1);

        if (!$limit->isAccepted()) {
            $event->setResponse(new JsonResponse(
                ['message' => 'Too many requests. Try again later.'],
                Response::HTTP_TOO_MANY_REQUESTS,
            ));
        }
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => 'onKernelRequest'];
    }
}
```

### CORS Configuration (NelmioCorsBundle)

```yaml
# config/packages/nelmio_cors.yaml
nelmio_cors:
    defaults:
        allow_credentials: true # required for cookie-based SPA auth
        allow_origin: ['%env(CORS_ALLOWED_ORIGINS)%'] # whitelist specific origins
        allow_methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        allow_headers: ['Content-Type', 'Authorization']
        expose_headers: ['X-Total-Count', 'X-Pagination-Page']
        max_age: 0
    paths:
        '^/api/':
            allow_origin: ['%env(CORS_ALLOWED_ORIGINS)%']

# NEVER: allow_origin: ['*'] with allow_credentials: true in production
```

## File Upload Security

### Validation

```php
final class UploadDocumentDto
{
    #[Assert\NotNull]
    #[Assert\File(
        maxSize: '10M',
        mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    )]
    public ?File $document = null;

    #[Assert\Image(maxSize: '2M', minWidth: 100, minHeight: 100, maxWidth: 2000, maxHeight: 2000)]
    public ?File $avatar = null;
}
```

### Secure Storage

```php
// Store files outside the public/ document root
$path = $uploader->store($file, 'documents'); // private filesystem, not public/uploads

// Use signed/temporary URLs for access (Flysystem + a signed-URL package, or a
// short-lived controller route that streams the file after an authorization check)
#[Route('/documents/{path}/download', name: 'documents_download')]
#[IsGranted('DOCUMENT_DOWNLOAD', subject: 'path')]
public function download(string $path, FilesystemOperator $privateStorage): StreamedResponse
{
    return new StreamedResponse(fn () => print($privateStorage->read($path)));
}
```

```yaml
# config/packages/flysystem.yaml — encrypt at rest on the storage side (e.g. S3 SSE)
flysystem:
    storages:
        documents.storage:
            adapter: 'aws'
            options:
                client: 'Aws\S3\S3Client'
                bucket: '%env(AWS_BUCKET)%'
```

## Dependencies and Secrets

### Composer Security

```bash
# Always audit dependencies in CI
composer audit

# Pin major versions in composer.json
"symfony/framework-bundle": "^7.0"
"doctrine/orm": "^3.0"

# Check for abandoned packages
composer outdated --direct

# Keep composer.lock in version control (it pins exact versions)
# Run `composer update` deliberately, never in CI/CD
```

### Secret Management

```bash
# Prefer the Symfony secrets vault over .env for real secrets
bin/console secrets:set APP_SECRET
bin/console secrets:set DATABASE_URL
bin/console secrets:set STRIPE_KEY
bin/console secrets:list --reveal # only in trusted environments

# For production: decrypt at deploy time with the vault decryption key,
# or use a secret manager and inject via env vars.

# Validate secrets at boot
$secrets = ['stripe_key', 'stripe_webhook_secret'];
foreach ($secrets as $key) {
    if (empty($_ENV[strtoupper($key)] ?? null)) {
        $logger->critical("Missing secret: {$key}");
    }
}
```

## Messenger Security

```php
// Encrypt sensitive message payloads via a custom Serializer,
// or keep only public identifiers in the message and re-fetch details in the handler
final class ProcessPaymentMessage
{
    public function __construct(
        public readonly string $paymentIntentId, // public IDs are fine
        // NEVER put raw card data on a message; fetch it from the payment
        // provider inside the handler using the intent ID.
    ) {}
}
```

```yaml
# config/packages/messenger.yaml — retries and rate limiting per transport
framework:
    messenger:
        transports:
            payments:
                dsn: '%env(MESSENGER_TRANSPORT_DSN)%'
                retry_strategy:
                    max_retries: 3
                    delay: 5000
        routing:
            App\Message\ProcessPaymentMessage: payments
```

## Logging Security Events

```yaml
# config/packages/monolog.yaml
monolog:
    channels: ['security_audit']
    handlers:
        security_audit:
            type: stream
            path: '%kernel.logs_dir%/security.log'
            level: warning
            channels: ['security_audit']
```

```php
final class SecurityLogger
{
    public function __construct(
        #[Monolog\Attribute\WithMonologChannel('security_audit')] private LoggerInterface $logger,
        private Security $security,
        private RequestStack $requestStack,
    ) {}

    public function log(string $event, array $context = []): void
    {
        $request = $this->requestStack->getCurrentRequest();
        $this->logger->warning($event, array_merge([
            'user_id' => $this->security->getUser()?->getUserIdentifier(),
            'ip' => $request?->getClientIp(),
            'user_agent' => $request?->headers->get('User-Agent'),
            'url' => $request?->getUri(),
            'timestamp' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
        ], $context));
    }
}
```

## Quick Security Checklist

| Check | Description |
|-------|-------------|
| `APP_DEBUG=0` | Never run with debug enabled in production |
| `APP_SECRET` set | Random 32+ char string, via secrets vault or env var |
| HTTPS enforced | Force HTTPS in production via subscriber or proxy |
| DTOs, not raw denormalization | Never deserialize the request body straight onto an entity |
| CSRF active | Form-component forms include a `_token`; verify server-side |
| JWT/token auth configured | LexikJWT or API Platform, with scoped claims |
| Rate limiting applied | Symfony RateLimiter on API and auth endpoints |
| Input validation | DTO + Validator constraints, never trust `Request` fields directly |
| File upload restrictions | Validate MIME types, size, dimensions with `Assert\File`/`Assert\Image` |
| `composer audit` in CI | Check dependencies for known vulnerabilities |
| Password hasher configured | Symfony PasswordHasher (bcrypt/Argon2id) |
| Session regeneration on login | Call `$session->migrate(true)` |
| Security headers subscriber | CSP, X-Frame-Options, X-Content-Type-Options |
| Logged security events | Audit log for auth failures, role changes, suspicious activity |
| `.env.local` not committed | Verify `.gitignore` includes `.env.local` |

## Related Skills

- `symfony-patterns` — Symfony architecture, routing, Doctrine, and API patterns
- `backend-patterns` — General backend API and database patterns
- `symfony-tdd` — Symfony testing with PHPUnit