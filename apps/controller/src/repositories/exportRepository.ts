import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ExportRepository { writeJson(area: string, payload: unknown): Promise<string> }

export class FileExportRepository implements ExportRepository {
  constructor(private readonly repoRoot: string) {}
  async writeJson(area: string, payload: unknown): Promise<string> {
    const directory = join(this.repoRoot, "output", area);
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, `${area}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }
}
