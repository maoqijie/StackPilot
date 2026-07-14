# Security Policy

## Supported Versions

StackPilot `0.3.0-preview.1` is a preview release. It is not stable and does not receive a guaranteed security-support window.

| Version | Security fixes |
| --- | --- |
| Current `main` branch | Best effort |
| `0.3.0-preview.x` | Best effort until superseded by a newer preview |
| Released `0.1.x` versions | Unsupported except as the documented schema-1 upgrade source |
| Older or modified versions | Not supported |

Until a stable release policy exists, reporters should reproduce issues against the latest `main` branch when it is safe to do so. See [docs/versioning.md](docs/versioning.md) for compatibility details.

## Reporting a Vulnerability

Do not open a public issue, discussion, pull request, or social-media post for a vulnerability that could expose credentials, enable unauthorized writes or command execution, bypass authentication, or compromise a host.

Use the repository's GitHub **Private Vulnerability Reporting** form under the Security tab. Include:

- the affected commit or version;
- the affected endpoint or component;
- reproduction steps or a minimal proof of concept;
- expected and observed impact;
- any known mitigations;
- whether the issue is already public or actively exploited.

The repository does not currently publish a security email address. If GitHub Private Vulnerability Reporting is unavailable, there is no verified private project reporting channel; do not place sensitive details in a public issue. The repository owner must enable GitHub Private Vulnerability Reporting before the project can reliably accept private reports.

## Response Process

When a private report is received, maintainers intend to:

1. acknowledge receipt and restrict details to people needed for triage;
2. validate the report and determine affected versions and severity;
3. coordinate a fix, negative tests, and release or mitigation guidance;
4. agree on disclosure timing with the reporter where practical;
5. publish an advisory after users have a reasonable opportunity to update.

No response-time or remediation-time service-level agreement is currently offered. Status and timing should be communicated through the private advisory.

Release security evidence includes pinned CI Actions, high/critical dependency and container scanning, a CycloneDX SBOM, SHA-256 manifests and keyless Sigstore/Cosign signatures tied to this repository's release workflow. A missing official signature means the artifact is not an official release.

## Safe Handling

- Test only systems and data you own or are authorized to assess.
- Do not access, retain, or disclose other users' data.
- Do not run destructive commands, disrupt services, or perform denial-of-service testing.
- Remove tokens, hostnames, paths, command output, and personal data from supporting material unless they are essential and shared privately.
- Allow maintainers time to investigate and prepare a fix before public disclosure.

Reports made in good faith are welcome, but this policy does not create a bug-bounty program or promise compensation.
