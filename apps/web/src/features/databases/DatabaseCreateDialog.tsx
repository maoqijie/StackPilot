import { useEffect, useRef, useState } from "react";
import type { AgentNodeRecord, DatabaseEngine, DatabaseOperationPlan } from "@stackpilot/contracts";
import { createDatabaseOperationPlan, fetchDatabaseNodes, fetchDatabaseOperation } from "../../api/databasesApi";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { executePlan, waitForDatabaseOperation } from "./operationClient";

type Credentials = { username: string; password: string; initialUsername: string; initialPassword: string };
const pem = (buffer: ArrayBuffer) => `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(buffer))).match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
async function decrypt(ciphertext: string, key: CryptoKey) { const bytes = Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0)); const plain = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, bytes); return JSON.parse(new TextDecoder().decode(plain)) as Credentials; }

export function DatabaseCreateDialog({ onClose, onComplete }: { onClose: () => void; onComplete: (credentials: Credentials) => void }) {
  const operationController = useRef<AbortController | null>(null);
  const [nodes, setNodes] = useState<AgentNodeRecord[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [nodeId, setNodeId] = useState(""); const [engine, setEngine] = useState<DatabaseEngine>("postgresql"); const [name, setName] = useState(""); const [port, setPort] = useState(""); const [initialDatabase, setInitialDatabase] = useState(""); const [plan, setPlan] = useState<DatabaseOperationPlan | null>(null); const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  useEffect(() => { const controller = new AbortController(); void fetchDatabaseNodes(controller.signal).then(({ nodes: rows }) => { const eligible = rows.filter((node) => node.status !== "revoked" && node.allowedCapabilities.includes("database.install")); setNodes(eligible); setNodeId(eligible[0]?.nodeId ?? ""); }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "节点列表加载失败"); }); return () => { controller.abort(); operationController.current?.abort(); }; }, []);
  const prepare = async () => {
    setBusy(true); setError(null);
    try { const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]); const publicKey = pem(await crypto.subtle.exportKey("spki", pair.publicKey)); const response = await createDatabaseOperationPlan({ kind: "install", nodeId, engine, name, port: port ? Number(port) : null, initialDatabase, credentialPublicKey: publicKey }); setPrivateKey(pair.privateKey); setPlan(response.plan); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "无法创建安装计划"); } finally { setBusy(false); }
  };
  const execute = async () => {
    if (!plan || !privateKey) return; setBusy(true); setError(null);
    const controller = new AbortController(); operationController.current = controller;
    try { const operation = await waitForDatabaseOperation(await executePlan(plan), controller.signal); const fresh = (await fetchDatabaseOperation(operation.id, controller.signal)).operation; if (!fresh.credentialEnvelope) throw new Error("安装已完成，但一次性凭据已过期或无权读取"); onComplete(await decrypt(fresh.credentialEnvelope.ciphertext, privateKey)); }
    catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "数据库安装失败"); }
    finally { if (operationController.current === controller) operationController.current = null; if (!controller.signal.aborted) setBusy(false); }
  };
  const close = () => { operationController.current?.abort(); onClose(); };
  return <ConfirmDialog title={plan ? "确认创建数据库实例" : "创建数据库实例"} message={plan ? plan.impact.join("；") : "在已注册 Agent 节点安装独立数据库实例。新实例监听所有地址，StackPilot 不修改主机防火墙。"} detail={plan?.target} confirmLabel={plan ? "确认安装" : "生成安装计划"} tone="warning" busy={busy} confirmDisabled={!plan && (!nodeId || !name || !initialDatabase)} onClose={close} onConfirm={() => void (plan ? execute() : prepare())}>
    {!plan && <div className="database-create-form"><label><span>节点</span><select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>{nodes.map((node) => <option key={node.nodeId} value={node.nodeId}>{node.nodeName} · {node.status}</option>)}</select></label><label><span>引擎</span><select value={engine} onChange={(e) => setEngine(e.target.value as DatabaseEngine)}><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option><option value="mariadb">MariaDB</option></select></label><label><span>实例名称</span><input value={name} pattern="[A-Za-z0-9_-]+" onChange={(e) => setName(e.target.value)} /></label><label><span>端口（留空自动选择）</span><input value={port} type="number" min="1" max="65535" onChange={(e) => setPort(e.target.value)} /></label><label><span>初始逻辑库</span><input value={initialDatabase} pattern="[A-Za-z0-9_-]+" onChange={(e) => setInitialDatabase(e.target.value)} /></label></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </ConfirmDialog>;
}
