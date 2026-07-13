import { resolve } from "node:path";
import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";

const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const domainList = (domains: string[]) => domains.join(" ");

export function assertDomainsUnclaimed(configuration: string, domains: readonly string[], ownedConfigurationPath: string) {
  const requested = domains.map((domain) => domain.toLowerCase());
  const ownedPath = resolve(ownedConfigurationPath);
  let currentPath = "";
  let currentConfiguration = "";
  const assertConfiguration = () => {
    if (!currentConfiguration || currentPath && resolve(currentPath) === ownedPath) return;
    const withoutComments = currentConfiguration.replace(/#[^\n]*/g, " ");
    for (const match of withoutComments.matchAll(/\bserver_name\s+([^;]+);/g)) {
      const claimed = (match[1] ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const conflict = requested.find((domain) => claimed.some((name) => name === domain || name.startsWith("*.") && domain.endsWith(name.slice(1))));
      if (conflict) throw new HelperError("DOMAIN_ALREADY_CLAIMED", `Domain ${conflict} is already present in the active Nginx configuration`);
    }
  };
  for (const line of configuration.split("\n")) {
    const marker = line.match(/^# configuration file (.+):\s*$/);
    if (marker) {
      assertConfiguration();
      currentPath = marker[1] ?? "";
      currentConfiguration = "";
      continue;
    }
    currentConfiguration += `${line}\n`;
  }
  assertConfiguration();
}

export function challengeConfiguration(plan: PreparedPlan, challengeRoot: string) {
  return `server {
  listen 80;
  listen [::]:80;
  server_name ${domainList(plan.domains)};
  location ^~ /.well-known/acme-challenge/ { root ${quote(challengeRoot)}; try_files $uri =404; }
  location / { return 503; }
}
`;
}

function statusConfiguration(site: ManagedSite, status: 503 | 410, challengeRoot: string) {
  return `server {
  listen 80;
  listen [::]:80;
  server_name ${domainList(site.domains)};
  location ^~ /.well-known/acme-challenge/ { root ${quote(challengeRoot)}; try_files $uri =404; }
  location / { return ${status}; }
}
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${domainList(site.domains)};
  ssl_certificate /etc/letsencrypt/live/${site.certificateName}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${site.certificateName}/privkey.pem;
  location / { return ${status}; }
}
`;
}

export function activeConfiguration(site: ManagedSite, sitesRoot: string, challengeRoot = "/var/lib/letsencrypt/stackpilot-challenges") {
  if (site.desiredState === "stopped") return statusConfiguration(site, 503, challengeRoot);
  if (site.desiredState === "deleted") return statusConfiguration(site, 410, challengeRoot);
  const accessLog = `/var/log/nginx/stackpilot-${site.siteId}.access.log`;
  const tls = `ssl_certificate /etc/letsencrypt/live/${site.certificateName}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${site.certificateName}/privkey.pem;`;
  const location = site.manifest.runtime === "static"
    ? `root ${quote(`${sitesRoot}/${site.siteId}/current/public`)};
  location / { try_files $uri $uri/ /index.html =404; }`
    : `location / {
    proxy_pass http://127.0.0.1:${site.port};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }`;
  return `server {
  listen unix:/run/stackpilot-sites/${site.siteId}.sock;
  server_name _;
  access_log off;
  ${location}
}
server {
  listen 80;
  listen [::]:80;
  server_name ${domainList(site.domains)};
  location ^~ /.well-known/acme-challenge/ { root ${quote(challengeRoot)}; try_files $uri =404; }
  location / { return 308 https://$host$request_uri; }
}
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${domainList(site.domains)};
  ${tls}
  access_log ${accessLog} combined;
  ${location}
}
`;
}

export function serviceUnit(site: ManagedSite, sitesRoot: string, environmentPath: string) {
  if (site.manifest.runtime === "static") return null;
  if (!site.runtimePath) throw new Error("RUNTIME_PATH_MISSING");
  return `[Unit]
Description=StackPilot managed site ${site.siteId}
After=network.target

[Service]
Type=simple
User=stackpilot-runtime
Group=stackpilot-runtime
WorkingDirectory=${siteCurrent(site, sitesRoot)}/app
EnvironmentFile=${environmentPath}
Environment=NODE_ENV=production
Environment=PORT=${site.port}
Environment=PATH=${site.runtimePath}/bin:/usr/bin:/bin
ExecStart=${site.runtimePath}/bin/npm run ${site.manifest.startScript}
Restart=on-failure
RestartSec=5s
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadOnlyPaths=${siteCurrent(site, sitesRoot)}

[Install]
WantedBy=multi-user.target
`;
}

function siteCurrent(site: ManagedSite, sitesRoot: string) { return `${sitesRoot}/${site.siteId}/current`; }
