# Native systemd Installation

Native installation is supported on Debian 12 and Ubuntu 24.04 LTS x86_64 with Node.js 22.x. Verify the tagged archive, extract it into a root-owned staging directory, then run:

The native Controller unit always uses the fixed `/usr/bin/crontab` executable, existing `crontab` system group and `/var/spool/cron/crontabs` spool path. Install the distribution package before the first installation or any same-version unit synchronization:

```bash
sudo apt-get update
sudo apt-get install cron
test -x /usr/bin/crontab
getent group crontab
test -d /var/spool/cron/crontabs
```

The installer fails with an actionable error before running Controller sysusers or replacing units when any dependency is absent. It then synchronizes the dedicated Controller user and its membership in the existing system `crontab` group on every run; the project sysusers file does not create or replace that distribution-owned group.

Release preflight checks the same three host dependencies when `STACKPILOT_ENABLE_CRONTAB_WRITE=1`. With the switch left at its default `0`, missing cron support does not fail preflight because schedule mutation remains disabled.

```bash
sudo deploy/scripts/install-systemd.sh controller
sudo deploy/scripts/install-systemd.sh agent   # only on an Agent host
sudo deploy/scripts/install-systemd.sh cert-helper # Linux Nginx/Certbot site operations and certificate renewal
```

The installer creates versioned directories and `current` symlinks. It installs locked production dependencies but does not invent secrets or start services. Configure `/etc/stackpilot/controller.env` from `deploy/examples/controller.env.example`; install the master key and Agent TLS material at `/etc/stackpilot/` with owner `root`, mode `0600`. `LoadCredential` exposes them only to the Controller process. Configure `/etc/stackpilot-agent/agent.env`, install its CA certificate, and place the one-time token in `/etc/stackpilot-agent/enrollment-token` as root mode `0600`; the Agent unit exposes it as a systemd credential. After enrollment, truncate that source file to an empty root-only placeholder before the next restart.

The site helper is optional and Linux-only. Its local socket is `/run/stackpilot-cert-helper/helper.sock`, mode `0660`, owner `root:stackpilot-cert`; native Controller and Agent processes receive supplementary membership in that group. The one-shot root helper accepts only strict schemas for readiness and public certificate inventory, plan preparation and activation, lifecycle changes, bounded structured-log reads, and opaque certificate renewal. It executes fixed Git, systemd, Nginx, Certbot, curl, and archive commands against configured roots. It has no network listener, sudoers rule, generic shell, caller-controlled executable, or caller-controlled filesystem path. Outbound access is limited by each fixed operation, including public GitHub HTTPS clones, pinned Node.js archives, local health checks, and ACME.

Re-running the installer for an already installed version revalidates the Controller cron dependencies, synchronizes Controller sysusers, synchronizes the corresponding systemd units and runs `daemon-reload`; it does not modify the release, `current` symlink, or service state. Review the unit diff, then restart the affected service or socket during a controlled maintenance window and verify readiness.

Install the nginx example after replacing every `.invalid` hostname and certificate path. Controller remains on `127.0.0.1:8787`; nginx is the only public listener. Bind Agent port 9443 to a private management address and allow only enrolled node networks at the firewall.

```bash
sudo nginx -t
sudo systemd-analyze verify deploy/systemd/*.service
sudo systemd-analyze verify deploy/systemd/*.socket
sudo systemctl enable --now stackpilot-controller nginx
sudo systemctl enable --now stackpilot-cert-helper.socket # managed site or renewal hosts only
sudo systemctl enable --now stackpilot-agent
sudo systemctl show stackpilot-controller -p User -p Group -p NoNewPrivileges
```

Controller and Agent use distinct non-root users, empty capability sets, restricted filesystems and owner-only state directories. The root helper is separately socket-activated and exposes only the fixed site-operation vocabulary. Keep management capabilities disabled per node until the helper readiness probe succeeds, then authorize only the required site capabilities.
