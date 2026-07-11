# StackPilot Web

This workspace contains the existing React, Vite, and TypeScript frontend. The migration does not split `App.tsx` or change its UI behavior.

From the repository root:

```bash
npm run dev --workspace @stackpilot/web
npm run test --workspace @stackpilot/web
npm run build --workspace @stackpilot/web
```

The Vite server proxies `/api` to the Controller on `127.0.0.1:8787`.
