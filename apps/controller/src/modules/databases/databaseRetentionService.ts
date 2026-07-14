import type { DatabaseRepository } from "../../repositories/databaseRepository.js";

const RETENTION_INTERVAL_MS = 60 * 60_000;

export class DatabaseRetentionService {
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly repository: DatabaseRepository) {
    this.run();
    this.timer = setInterval(() => this.run(), RETENTION_INTERVAL_MS);
    this.timer.unref();
  }

  run(now = new Date().toISOString()) {
    return this.repository.purgeExpiredSensitiveData(now);
  }

  shutdown() {
    clearInterval(this.timer);
  }
}
