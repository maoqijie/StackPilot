import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScheduleJobs, createScheduleJob, deleteScheduleJob, runScheduleJob, updateScheduleJob } from "../api/scheduleApi";
import type { SchedulePayload } from "../api/scheduleApi";
import { SchedulePage } from "../pages/SchedulePage";

vi.mock("../api/scheduleApi", () => ({
  fetchScheduleJobs: vi.fn(),
  createScheduleJob: vi.fn(),
  deleteScheduleJob: vi.fn(),
  runScheduleJob: vi.fn(),
  updateScheduleJob: vi.fn(),
}));

const failedJob = {
  id: "job-failed",
  name: "nightly-backup",
  cron: "0 2 * * *",
  command: "/usr/local/bin/backup --all",
  enabled: true,
  nextRun: "明天 02:00",
  lastRun: "今天 02:00",
  result: "失败" as const,
};

const successfulJob = {
  ...failedJob,
  id: "job-success",
  name: "health-check",
  result: "成功" as const,
};

function payload(jobs = [failedJob, successfulJob]): SchedulePayload {
  return { jobs, scannedAt: "2026-07-15T02:00:00.000Z" };
}

describe("schedule failed page", () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    vi.mocked(createScheduleJob).mockReset();
    vi.mocked(deleteScheduleJob).mockReset();
    vi.mocked(runScheduleJob).mockReset();
    vi.mocked(updateScheduleJob).mockReset();
    vi.mocked(fetchScheduleJobs).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps only failed jobs and refreshes silently every ten seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchScheduleJobs)
      .mockResolvedValueOnce(payload())
      .mockResolvedValueOnce(payload([{ ...failedJob, lastRun: "今天 02:10" }]));

    render(<SchedulePage page="schedule-failed" notify={notify} />);
    await act(async () => undefined);
    expect(screen.getAllByText("nightly-backup")).toHaveLength(2);
    expect(screen.queryByText("health-check")).not.toBeInTheDocument();
    expect(screen.getByText(/最近采集：/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(fetchScheduleJobs).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("今天 02:10")).toHaveLength(2);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows a retryable initial error without replacing it with fixture rows", async () => {
    vi.mocked(fetchScheduleJobs)
      .mockRejectedValueOnce(new Error("crontab 暂不可用"))
      .mockResolvedValueOnce(payload([failedJob]));

    render(<SchedulePage page="schedule-failed" notify={notify} />);
    await act(async () => undefined);
    expect(screen.getByText("crontab 暂不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText("nightly-backup")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /重试/ }));
    await act(async () => undefined);
    expect(screen.getAllByText("nightly-backup")).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith("crontab 暂不可用", "danger");
  });

  it("keeps details in a body-level drawer and separates modal and delete surfaces", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchScheduleJobs).mockResolvedValue(payload([failedJob]));
    render(<SchedulePage page="schedule-enabled" notify={notify} />);
    await act(async () => undefined);
    expect(screen.getAllByText("nightly-backup")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "nightly-backup" })[0]);
    const drawer = screen.getByRole("region", { name: "任务详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("schedule-job-drawer");
    expect(drawer).not.toHaveClass("schedule-job-modal");
    expect(within(drawer).getByText("/usr/local/bin/backup --all")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "关闭详情" }));
    act(() => vi.advanceTimersByTime(180));
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    const deleteDialog = screen.getByRole("alertdialog", { name: "删除定时任务" });
    expect(deleteDialog.parentElement).toBe(document.body);
    expect(deleteDialog).toHaveClass("schedule-delete-dialog");

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "关闭确认弹窗" }));
    act(() => vi.advanceTimersByTime(180));
    fireEvent.click(screen.getByRole("button", { name: "新建任务" }));
    const modal = screen.getByRole("dialog", { name: "新建计划任务" });
    expect(modal).toHaveClass("schedule-job-modal");
    expect(modal).toHaveAttribute("data-motion-surface", "modal");
  });
});
