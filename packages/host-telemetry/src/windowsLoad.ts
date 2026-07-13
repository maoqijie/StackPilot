import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const UINT32_MAX = 0xffff_ffff;
const POWERSHELL_COMMAND = "$ErrorActionPreference='Stop';$value=Get-CimInstance -Namespace 'root/cimv2' -Query 'SELECT ProcessorQueueLength FROM Win32_PerfFormattedData_PerfOS_System'|Select-Object -First 1 -ExpandProperty ProcessorQueueLength;if($null -eq $value){throw 'ProcessorQueueLength unavailable'};ConvertTo-Json -InputObject ([uint32]$value) -Compress";
const WINDOWS_LOAD_WINDOWS_SECONDS = [60, 300, 900] as const;
const execFileAsync = promisify(execFile);

export type WindowsLoadAverage = [number, number, number];

export type ProcessorQueueCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string }>;

export type WindowsLoadSamplerSources = {
  monotonicNow: () => number;
  readProcessorQueueLength: () => Promise<number | null>;
};

const defaultCommandRunner: ProcessorQueueCommandRunner = async (executable, args, options) => {
  const { stdout } = await execFileAsync(executable, [...args], options);
  return { stdout };
};

export function parseProcessorQueueLength(output: string) {
  const value = output.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 && parsed <= UINT32_MAX
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function collectProcessorQueueLength(
  runCommand: ProcessorQueueCommandRunner = defaultCommandRunner,
): Promise<number | null> {
  try {
    const { stdout } = await runCommand(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_COMMAND],
      { timeout: 4_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    return parseProcessorQueueLength(stdout);
  } catch {
    return null;
  }
}

export class WindowsLoadSampler {
  private averages: WindowsLoadAverage | null = null;
  private lastSampleAt: number | null = null;
  private inFlight: Promise<WindowsLoadAverage | null> | null = null;

  constructor(private readonly sources: WindowsLoadSamplerSources = {
    monotonicNow: () => performance.now(),
    readProcessorQueueLength: collectProcessorQueueLength,
  }) {}

  sample(coreUsagePercents: readonly number[]): Promise<WindowsLoadAverage | null> {
    if (this.inFlight) return this.inFlight;
    if (!coreUsagePercents.length || coreUsagePercents.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      return Promise.resolve(null);
    }
    this.inFlight = this.collect(coreUsagePercents).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async collect(coreUsagePercents: readonly number[]): Promise<WindowsLoadAverage | null> {
    let queueLength: number | null;
    try {
      queueLength = await this.sources.readProcessorQueueLength();
    } catch {
      return null;
    }
    if (queueLength === null || !Number.isInteger(queueLength) || queueLength < 0 || queueLength > UINT32_MAX) return null;

    const sampledAt = this.sources.monotonicNow();
    if (!Number.isFinite(sampledAt)) return null;
    const busyCoreCount = coreUsagePercents.reduce((sum, value) => sum + value, 0) / 100;
    const instantaneousLoad = busyCoreCount + queueLength;
    if (!this.averages || this.lastSampleAt === null || sampledAt < this.lastSampleAt) {
      this.averages = [instantaneousLoad, instantaneousLoad, instantaneousLoad];
    } else {
      const elapsedSeconds = (sampledAt - this.lastSampleAt) / 1_000;
      this.averages = this.averages.map((previous, index) => {
        const windowSeconds = WINDOWS_LOAD_WINDOWS_SECONDS[index];
        if (windowSeconds === undefined) return previous;
        const weight = Math.exp(-elapsedSeconds / windowSeconds);
        return previous * weight + instantaneousLoad * (1 - weight);
      }) as WindowsLoadAverage;
    }
    this.lastSampleAt = sampledAt;
    return [...this.averages];
  }
}

const defaultWindowsLoadSampler = new WindowsLoadSampler();

export const collectWindowsLoadAverage = (coreUsagePercents: readonly number[]) =>
  defaultWindowsLoadSampler.sample(coreUsagePercents);
