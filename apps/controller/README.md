# StackPilot Controller

This workspace contains the strict TypeScript local Controller API. Process startup is separated from application assembly, and platform access is injected behind adapter interfaces. It preserves `/healthz` and `/api/overview/*` and adds the non-sensitive `/readyz` readiness endpoint.

From the repository root:

```bash
npm run dev --workspace @stackpilot/controller
npm run typecheck --workspace @stackpilot/controller
npm run test --workspace @stackpilot/controller
npm run build --workspace @stackpilot/controller
npm run start --workspace @stackpilot/controller
```

`dev` runs TypeScript directly with watch mode. `build` emits `dist/`, and `start` runs the emitted JavaScript. Security configuration is documented in the root `README.md` and `.env.example`.
