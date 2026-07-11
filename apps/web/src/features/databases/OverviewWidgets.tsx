import { Sparkline, StatusLight } from "../../components/ui/StatusVisuals";

function DonutCard() {
  return <div className="donut-card"><div className="donut" /><div><p><StatusLight tone="green" /> 成功 <b>52 (96.4%)</b></p><p><StatusLight tone="red" /> 失败 <b>2 (3.6%)</b></p><p>总计 <b>54</b></p></div></div>;
}

function HealthMini() {
  return <div className="health-mini">{[["延迟 (Ping)", "12 ms", [10, 12, 11, 15, 12, 13]], ["连接数", "24 / 200", [18, 20, 24, 21, 25, 24]], ["CPU 使用率", "18%", [12, 16, 18, 13, 19, 18]], ["I/O 等待", "2%", [3, 2, 2, 4, 3, 2]]].map(([label, value, points]) => <p key={label as string}><span>{label as string}</span><b>{value as string}</b><Sparkline values={points as number[]} tone="blue" /></p>)}</div>;
}

function SlowSqlList() {
  return <div className="slow-sql">{["SELECT * FROM orders WHERE status = 'pending' ...", "UPDATE invoices SET status = 'paid' WHERE id IN ...", "SELECT uid, name, COUNT(id) FROM users ...", "DELETE FROM logs WHERE created_at < NOW() ...", "INSERT INTO metrics (name, value, created_at) ..."].map((sql, index) => <p key={sql}><span>{sql}</span><b>{[2.48, 2.41, 1.95, 1.73, 1.28][index]}s</b></p>)}</div>;
}

function MiniAuditList() {
  return <div className="mini-audit">{["创建只读用户 readonly_reporter", "触发手动备份 billing-mysql-02", "修改连接池配置 analytics-mysql-01", "新增备份策略 analytics-mysql-01"].map((item, index) => <p key={item}><span>{["10:42", "09:15", "08:51", "昨天 23:30"][index]}</span><b>{index === 0 ? "张工" : index === 1 ? "李工" : "系统"}</b><em>{item}</em></p>)}</div>;
}

export { DonutCard, HealthMini, SlowSqlList, MiniAuditList };
