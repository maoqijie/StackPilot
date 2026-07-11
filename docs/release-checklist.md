# Release Checklist

A tag may be marked as a release only when every applicable item passes. Record exceptions; do not waive security gates silently.

- [ ] Version, changelog, upgrade notes and compatibility matrix agree; tag is `v<package version>`.
- [ ] `npm ci`, lint, typecheck, unit/integration/security tests, deployment tests, build and dependency audit pass.
- [ ] Desktop and mobile HTTPS E2E pass without console errors or unexpected failed requests.
- [ ] Compose parses; all three images build as non-root; systemd units verify on supported Linux.
- [ ] Trivy reports no high/critical dependency, image or deployment finding.
- [ ] Schema upgrade, failed migration rollback, backup checksum and isolated restore drill pass.
- [ ] Release archive and all images carry the exact version; no `latest`-only publication.
- [ ] CycloneDX SBOM, third-party license inventory, provenance, download SHA-256 manifest and `IMAGE_DIGESTS` exist.
- [ ] Artifact and image Cosign OIDC signatures verify against this repository workflow identity.
- [ ] Secret/path scan finds no credential, private key, test secret or build-host absolute path.
- [ ] Clean installation exposes only intended ports; process users and file permissions are recorded.
- [ ] Known issues and unsupported platforms are explicitly documented.

Data destruction is never part of upgrade or rollback. `uninstall.sh program-only` preserves data; `destroy-data` additionally requires `STACKPILOT_CONFIRM_DESTROY=DESTROY-STACKPILOT-DATA`.

For an official artifact bundle, verify with the certificate identity and issuer recorded by Sigstore:

```bash
cosign verify-blob --bundle stackpilot-0.2.0-preview.2.tar.gz.sigstore.json \
  --certificate-identity-regexp 'https://github.com/maoqijie/StackPilot/.github/workflows/release.yml@refs/tags/v.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  stackpilot-0.2.0-preview.2.tar.gz
sha256sum --check SHA256SUMS
```
