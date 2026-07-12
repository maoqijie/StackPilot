import { exportOverviewRisks, fetchOverviewRisks } from "../api/overviewApi";
import type { OverviewRiskRecord } from "../api/overviewApi";
import { OverviewRiskDetailModal } from "../components/ui/OverviewRiskDetailModal";
import { AlertTriangle, Clock3, Download, Eye, KeyRound, Shield, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { FieldSelect } from "../components/ui/FormControls";
import { useOptionalOverviewData } from "../features/overview/OverviewDataProvider";
import { reportApiError } from "../features/overview/model";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, Tone } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

function OverviewRisksPage({ notify }: { notify: Notify }) {
  const shared = useOptionalOverviewData();
  const usesSharedOverview = shared !== null;
  const [localRows, setLocalRows] = useState<OverviewRiskRecord[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [stateFilter, setStateFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localScannedAt, setLocalScannedAt] = useState<string | null>(null);
  const rows = shared?.overview?.risks ?? localRows;
  const loading = shared ? shared.loading && !shared.overview : localLoading;
  const error = shared?.error ?? localError;
  const scannedAt = formatBackendDateTime(shared?.overview?.collectedAt ?? localScannedAt, "等待采集");
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.title.toLowerCase().includes(query) || row.target.toLowerCase().includes(query) || row.owner.toLowerCase().includes(query) || row.traceId.toLowerCase().includes(query);
    const matchLevel = levelFilter === "全部" || row.level === levelFilter;
    const matchState = stateFilter === "全部" || row.status === stateFilter;
    return matchSearch && matchLevel && matchState;
  });
  const openCount = rows.filter((row) => row.status === "待处理").length;
  const highCount = rows.filter((row) => row.level === "高危" && row.status === "待处理").length;

  const syncRisks = useCallback((payload: Awaited<ReturnType<typeof fetchOverviewRisks>>) => {
    setLocalRows(payload.risks);
    setLocalScannedAt(payload.scannedAt ?? null);
    setLocalError(null);
  }, []);

  const loadRisks = useCallback(async (signal?: AbortSignal, silent = false) => {
    try {
      syncRisks(await fetchOverviewRisks(signal));
    } catch (loadError) {
      if (signal?.aborted) return;
      if (!silent) {
        setLocalError(loadError instanceof Error ? loadError.message : "风险中心后端加载失败");
        reportApiError(loadError, notify, "风险中心后端加载失败");
      }
    } finally {
      if (!signal?.aborted) setLocalLoading(false);
    }
  }, [notify, syncRisks]);

  useEffect(() => {
    if (usesSharedOverview) return;
    const controller = new AbortController();
    fetchOverviewRisks(controller.signal)
      .then((payload) => {
        syncRisks(payload);
        setLocalLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setLocalError(loadError instanceof Error ? loadError.message : "风险中心后端加载失败");
        setLocalLoading(false);
        reportApiError(loadError, notify, "风险中心后端加载失败");
      });
    return () => controller.abort();
  }, [notify, syncRisks, usesSharedOverview]);

  const autoRefreshRisks = useCallback(async (signal: AbortSignal) => {
    await loadRisks(signal, true);
  }, [loadRisks]);

  useAutoRefresh(autoRefreshRisks, undefined, !usesSharedOverview && !loading);

  const retry = () => usesSharedOverview ? shared.reload() : loadRisks();

  const exportRisksFromApi = async () => {
    try {
      const payload = await exportOverviewRisks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出风险报告失败");
    }
  };

  return (
    <ModulePageShell
      title="风险中心"
      subtitle={loading ? "正在加载安全、证书与服务健康风险" : error ? "风险采集暂时不可用，请重试" : `集中处理待办风险，最近扫描于 ${scannedAt}`}
      page="overview-risks"
      viewContext={false}
      actions={<button className="ghost" type="button" onClick={exportRisksFromApi}><Download size={14} /> 导出报告</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索风险、目标或 trace id" onChange={setSearch} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高危", "中危", "低危"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={stateFilter} options={["全部", "待处理"]} onChange={setStateFilter} /></>}
      metrics={<><MetricTile icon={Shield} label="待处理风险" value={`${openCount}`} tone={openCount ? "orange" : "green"} /><MetricTile icon={KeyRound} label="高危风险" value={`${highCount}`} tone={highCount ? "red" : "green"} /><MetricTile icon={Clock3} label="实时扫描" value={scannedAt || "-"} tone="blue" /></>}
    >
      {loading && <span className="sr-only" role="status" aria-live="polite">正在从 /api/overview/risks 采集风险</span>}
      {error && (
        <div className="overview-error-state risks-error-state">
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void retry()}>重试</button>
        </div>
      )}
      {selected && (
        <OverviewRiskDetailModal risk={selected} onClose={() => setSelectedId(null)} />
      )}
      <DataTable
        columns={[
          { key: "title", label: "风险", width: "208px", render: (row) => <b>{row.title}</b> },
          { key: "level", label: "等级", width: "96px", render: (row) => <RiskLevel level={row.level} /> },
          { key: "status", label: "状态", width: "104px", render: (row) => <span className="risk-status"><Clock3 size={14} />{row.status}</span> },
          { key: "target", label: "目标", width: "176px", render: (row) => <span className="risk-target" title={row.target}>{row.target}</span> },
          { key: "owner", label: "负责人", width: "86px", render: (row) => row.owner },
          { key: "detected", label: "发现时间", width: "105px", render: (row) => row.detected },
          { key: "impact", label: "影响", width: "208px", render: (row) => row.impact },
          { key: "actions", label: "操作", width: "92px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelectedId(row.id)}><Eye size={13} /> 详情</button>
            </div>
          ) },
        ]}
        rows={filteredRows}
        emptyText={error ? "风险采集失败，未显示示例数据" : loading ? "正在采集风险" : "没有匹配的风险"}
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <header className="module-card-head">
              <span className="module-card-title"><Shield size={15} /><strong>{row.title}</strong></span>
              <RiskLevel level={row.level} />
            </header>
            <div className="module-card-meta">
              <span><b>目标</b><em>{row.target}</em></span>
              <span><b>状态</b><em className="risk-status"><Clock3 size={14} />{row.status}</em></span>
              <span><b>负责人</b><em>{row.owner}</em></span>
              <span><b>发现时间</b><em>{row.detected}</em></span>
            </div>
            <p className="module-card-code">{row.impact}</p>
            <footer className="module-card-footer"><span>风险处置</span><button className="ghost small" type="button" onClick={() => setSelectedId(row.id)}><Eye size={13} /> 查看详情</button></footer>
          </>
        )}
      />
    </ModulePageShell>
  );
}

function RiskLevel({ level }: { level: OverviewRiskRecord["level"] }) {
  const tone: Tone = level === "高危" ? "red" : level === "中危" ? "orange" : "blue";
  const Icon = level === "高危" ? ShieldAlert : AlertTriangle;
  return <span className={`pill risk-level ${tone}`}><Icon size={13} />{level}</span>;
}

export { OverviewRisksPage };
