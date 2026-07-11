import { exportOverviewRisks, fetchOverviewRisks, scanOverviewRisks } from "../api/overviewApi";
import type { OverviewRiskRecord } from "../api/overviewApi";
import { OverviewRiskDetailModal } from "../components/ui/OverviewRiskDetailModal";
import { Clock3, Download, KeyRound, RefreshCw, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { FieldSelect } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { reportApiError } from "../features/overview/model";
import type { Notify, Tone } from "../types/app";
import { currentClock } from "../utils/time";

function OverviewRisksPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<OverviewRiskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [stateFilter, setStateFilter] = useState("全部");
  const [selected, setSelected] = useState<OverviewRiskRecord | null>(null);
  const [scannedAt, setScannedAt] = useState("刚刚");
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.title.toLowerCase().includes(query) || row.target.toLowerCase().includes(query) || row.owner.toLowerCase().includes(query) || row.traceId.toLowerCase().includes(query);
    const matchLevel = levelFilter === "全部" || row.level === levelFilter;
    const matchState = stateFilter === "全部" || row.status === stateFilter;
    return matchSearch && matchLevel && matchState;
  });
  const openCount = rows.filter((row) => row.status === "待处理").length;
  const highCount = rows.filter((row) => row.level === "高危" && row.status === "待处理").length;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewRisks(controller.signal)
      .then((payload) => {
        setRows(payload.risks);
        setScannedAt(payload.scannedAt ?? "刚刚");
        setSelected((current) => current ? payload.risks.find((row) => row.id === current.id) ?? null : null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "风险中心后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const scanRisksFromApi = async () => {
    try {
      const payload = await scanOverviewRisks();
      setRows(payload.risks);
      setScannedAt(payload.scannedAt ?? currentClock());
      setSelected((current) => current ? payload.risks.find((row) => row.id === current.id) ?? null : null);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "重新扫描失败");
    }
  };

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
      subtitle={loading ? "正在从后端加载风险中心。" : `集中处理首页总览暴露的安全、证书和服务健康风险。最近扫描：${scannedAt}`}
      page="overview-risks"
      actions={<><button className="ghost" type="button" onClick={exportRisksFromApi}><Download size={14} /> 导出报告</button><button className="primary" type="button" onClick={scanRisksFromApi}><RefreshCw size={14} /> 重新扫描</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索风险、目标或 trace id" onChange={setSearch} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高危", "中危", "低危"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={stateFilter} options={["全部", "待处理"]} onChange={setStateFilter} /></>}
      metrics={<><MetricTile icon={Shield} label="待处理风险" value={`${openCount}`} tone={openCount ? "orange" : "green"} /><MetricTile icon={KeyRound} label="高危风险" value={`${highCount}`} tone={highCount ? "red" : "green"} /><MetricTile icon={Clock3} label="实时扫描" value={scannedAt || "-"} tone="blue" /></>}
    >
      {selected && (
        <OverviewRiskDetailModal risk={selected} onClose={() => setSelected(null)} />
      )}
      <DataTable
        columns={[
          { key: "title", label: "风险", width: "240px", render: (row) => <b>{row.title}</b> },
          { key: "level", label: "等级", width: "82px", render: (row) => <span className={`pill ${row.level === "高危" ? "red" : row.level === "中危" ? "blue" : "green"}`}>{row.level}</span> },
          { key: "status", label: "状态", width: "90px", render: (row) => <><StatusLight tone={riskTone(row.level)} /> {row.status}</> },
          { key: "target", label: "目标", width: "200px", render: (row) => row.target },
          { key: "owner", label: "负责人", width: "86px", render: (row) => row.owner },
          { key: "detected", label: "发现时间", width: "105px", render: (row) => row.detected },
          { key: "impact", label: "影响", width: "230px", render: (row) => row.impact },
          { key: "actions", label: "操作", width: "92px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelected(row)}>详情</button>
            </div>
          ) },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的风险"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function riskTone(level: OverviewRiskRecord["level"]): Tone {
  if (level === "高危") return "red";
  if (level === "中危") return "orange";
  return "blue";
}

export { OverviewRisksPage };
