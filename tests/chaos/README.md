# Chaos engineering helpers

Reusable injectors for Playwright / Vitest scenarios. **Do not** enable in production builds.

## Injectors

| Module | Behavior |
|--------|----------|
| `injectors/latency.ts` | Delay async operations |
| `injectors/network.ts` | Flip online/offline |
| `injectors/authDrift.ts` | Inject bad scoped storage keys |
| `injectors/websocketDisconnect.ts` | Toggle offline to force WS disconnect |

## Usage (example)

```ts
import { withLatency } from "./injectors/latency";

await withLatency(2000, async () => {
  await page.click('[data-testid="pay-invoice"]');
});
```

## Scenarios & drills

- Vitest smoke: [`scenarios/chaos-scenarios.test.ts`](./scenarios/chaos-scenarios.test.ts)
- Operator steps: [`drill-runbook.md`](./drill-runbook.md)

## Roadmap

- WebSocket force-close helper
- Clock skew simulation
- Duplicate domain-event replay
