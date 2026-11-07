# Security Smoke Tests

Minimal regression tests for critical security flows.

## Running Tests

```bash
# Run all security smoke tests
deno test --allow-net --allow-env functions/tests/security_smoke_test.ts

# Run specific test
deno test --allow-net --allow-env --filter "endpointIsolation" functions/tests/security_smoke_test.ts

# Run with verbose output
deno test --allow-net --allow-env functions/tests/security_smoke_test.ts -- --verbose
```

## Test Coverage

1. **endpointIsolation** - Verifies non-admin users cannot isolate devices
2. **sendMFACode** - Verifies proper error when Twilio unconfigured
3. **downloadEvidenceFile** - Verifies secure headers (attachment + nosniff)
4. **Rate limiting** - Verifies 429 returned after threshold exceeded
5. **Risky file downloads** - Verifies ack=1 required for executable files
6. **RBAC permissions** - Verifies permission-based access control

## Test Philosophy

- **Minimal**: Only tests critical security gates
- **Fast**: No network calls to real services
- **Focused**: Unit-style tests, not integration tests
- **Mocked**: Uses stubs for external dependencies (Twilio, Stripe, etc.)

## Adding New Tests

Keep tests focused on:
- Authentication/authorization failures
- Input validation rejections
- Security header enforcement
- Rate limit enforcement
- RBAC permission checks

Avoid:
- Testing every endpoint
- Full integration tests
- Tests requiring real API keys
- Overly complex test frameworks