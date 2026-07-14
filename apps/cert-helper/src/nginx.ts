import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";

const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const domainList = (domains: string[]) => domains.join(" ");

function tokens(configuration: string) {
  const result: string[] = []; let token = ""; let quoteCharacter = ""; let escaped = false; let comment = false;
  const flush = () => { if (token) { result.push(token); token = ""; } };
  for (const character of configuration) {
    if (comment) { if (character === "\n") comment = false; continue; }
    if (escaped) { token += `\\${character}`; escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quoteCharacter) { if (character === quoteCharacter) quoteCharacter = ""; else token += character; continue; }
    if (character === '"' || character === "'") { quoteCharacter = character; continue; }
    if (character === "#") { flush(); comment = true; continue; }
    if (/\s/.test(character)) { flush(); continue; }
    if (character === ";" || character === "{" || character === "}") { flush(); result.push(character); continue; }
    token += character;
  }
  if (escaped || quoteCharacter) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Nginx server-name ownership could not be parsed safely");
  flush(); return result;
}

function regexClaimsDomain(name: string, domain: string) {
  const insensitive = name.startsWith("~*"); const pattern = name.slice(insensitive ? 2 : 1);
  if (!pattern.startsWith("^") || !pattern.endsWith("$") || pattern.length > 512) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Complex Nginx regex ownership requires manual review");
  const body = pattern.slice(1, -1); let literal = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;
    if (character === "\\" && (body[index + 1] === "." || body[index + 1] === "-")) { literal += body[index + 1]; index += 1; continue; }
    if (!/[a-z0-9-]/i.test(character)) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Complex Nginx regex ownership requires manual review");
    literal += character;
  }
  return insensitive ? literal.toLowerCase() === domain : literal === domain;
}

function nameClaimsDomain(nameValue: string, domain: string) {
  const name = nameValue.startsWith("~") ? nameValue : nameValue.toLowerCase();
  if (/\$(?:[a-z_]|\{)/i.test(name)) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Variable Nginx server names require manual review");
  if (name.startsWith("~")) return regexClaimsDomain(name, domain);
  if (name === "_" || name === "") return false;
  if (name.startsWith("*.")) return domain.endsWith(name.slice(1)) && domain !== name.slice(2);
  if (name.startsWith(".")) return domain === name.slice(1) || domain.endsWith(name);
  if (name.endsWith(".*") && name.indexOf("*") === name.length - 1) return domain.startsWith(name.slice(0, -1)) && domain.length > name.length - 1;
  if (name.includes("*") || !/^[a-z0-9.-]+$/.test(name)) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Complex Nginx server names require manual review");
  return name === domain;
}

function serverNames(configuration: string) {
  const parsed = tokens(configuration); const result: string[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    if (parsed[index] !== "server_name") continue;
    let terminated = false;
    for (index += 1; index < parsed.length; index += 1) {
      const value = parsed[index]!;
      if (value === ";") { terminated = true; break; }
      if (value === "{" || value === "}") break;
      result.push(value);
    }
    if (!terminated) throw new HelperError("DOMAIN_OWNERSHIP_UNDETERMINED", "Nginx server-name ownership could not be parsed safely");
  }
  return result;
}

export function assertDomainsUnclaimed(configuration: string, domains: readonly string[], ownedConfigurationPath: string) {
  const requested = domains.map((domain) => domain.toLowerCase());
  let currentPath = "";
  let currentConfiguration = "";
  const assertConfiguration = () => {
    if (!currentConfiguration || currentPath === ownedConfigurationPath) return;
    for (const claimed of serverNames(currentConfiguration)) {
      const conflict = requested.find((domain) => nameClaimsDomain(claimed, domain));
      if (conflict) throw new HelperError("DOMAIN_ALREADY_CLAIMED", `Domain ${conflict} is already present in the active Nginx configuration`);
    }
  };
  for (const line of configuration.split("\n")) {
    const marker = line.match(/^\s*# configuration file (.+):\s*$/);
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
