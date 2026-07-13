import { CheckCircle2, CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import type { FileUploadRecord } from "./types";
import type { Tone } from "../../types/app";

function UploadStatus({ status }: { status: FileUploadRecord["status"] }) {
  const tone: Tone = status === "已完成" ? "green" : status === "失败" ? "red" : status === "上传中" ? "blue" : "orange";
  const Icon = status === "已完成" ? CheckCircle2 : status === "失败" ? CircleAlert : status === "上传中" ? LoaderCircle : Clock3;
  return <span className={`pill file-upload-status ${tone}`}><Icon size={14} aria-hidden="true" />{status}</span>;
}

function UploadProgress({ value, detail = false }: { value: number; detail?: boolean }) {
  if (detail) {
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    return (
      <span className="upload-progress-card" role="progressbar" aria-label={`上传进度 ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="upload-progress-track" cx="32" cy="32" r={radius} />
          <circle className="upload-progress-value" cx="32" cy="32" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
        </svg>
        <span><strong>{value}</strong><em>%</em></span>
      </span>
    );
  }
  return (
    <span className="upload-progress-inline" role="progressbar" aria-label={`上传进度 ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <i><span style={{ width: `${value}%` }} /></i>
      <b>{value}%</b>
    </span>
  );
}

export { UploadProgress, UploadStatus };
