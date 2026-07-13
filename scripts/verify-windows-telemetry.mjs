import { collectHostTelemetry } from "../packages/host-telemetry/dist/index.js";

if (process.platform !== "win32") throw new Error("Windows telemetry verification must run on Windows");

const snapshots = [];
for (let index = 0; index < 3; index += 1) {
  snapshots.push(await collectHostTelemetry("win32"));
  if (index < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
}

const valid = snapshots.every((snapshot) =>
  snapshot.loadAverage?.length === 3
  && snapshot.loadAverage.every((value) => Number.isFinite(value) && value >= 0),
);
if (!valid) throw new Error("Windows equivalent load was unavailable during continuous collection");

process.stdout.write(`${JSON.stringify(snapshots.map((snapshot) => snapshot.loadAverage))}\n`);
