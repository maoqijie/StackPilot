import type { PageKey } from "../../types/app";

function firewallPagePreset(page: PageKey) {
  if (page === "firewall-open") return { protocol: "全部", source: "0.0.0.0/0", search: "", subtitle: "开放端口视图，默认展示公网来源规则。" };
  if (page === "firewall-deny") return { protocol: "全部", source: "全部", search: "", subtitle: "拦截记录视图，查看被拒绝或已放行的访问事件。" };
  return { protocol: "全部", source: "全部", search: "", subtitle: "读取本机 UFW 实际规则，并管理由 StackPilot 创建的放行规则。" };
}

function isValidFirewallSource(value: string) {
  const source = value.trim();
  if (!source) return false;
  const cidrParts = source.split("/");
  if (cidrParts.length > 2) return false;
  if (cidrParts[0]?.includes(":")) {
    if (!/^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(cidrParts[0])) return false;
    return cidrParts.length === 1 || (/^\d+$/.test(cidrParts[1] ?? "") && Number(cidrParts[1]) <= 128);
  }
  if (cidrParts.length === 2) {
    const prefix = Number(cidrParts[1]);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  }
  const octets = cidrParts[0].split(".");
  return octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const number = Number(octet);
    return number >= 0 && number <= 255;
  });
}

function isValidIpv4Address(value: string) {
  const octets = value.trim().split(".");
  return octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const number = Number(octet);
    return number >= 0 && number <= 255;
  });
}

export { firewallPagePreset, isValidFirewallSource, isValidIpv4Address };
