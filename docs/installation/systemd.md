# Native systemd Installation

Native installation is supported on Debian 12 and Ubuntu 24.04 LTS x86_64 with Node.js 22.x. Verify the tagged archive, extract it into a root-owned staging directory, then run:

```bash
sudo deploy/scripts/install-systemd.sh controller
sudo deploy/scripts/install-systemd.sh agent   # only on an Agent host
```

The installer creates versioned directories and `current` symlinks. It installs locked production dependencies but does not invent secrets or start services. Configure `/etc/stackpilot/controller.env` from `deploy/examples/controller.env.example`; install the master key and Agent TLS material at `/etc/stackpilot/` with owner `root`, mode `0600`. `LoadCredential` exposes them only to the Controller process. Configure `/etc/stackpilot-agent/agent.env`, install its CA certificate, and place the one-time token in `/etc/stackpilot-agent/enrollment-token` as root mode `0600`; the Agent unit exposes it as a systemd credential. After enrollment, truncate that source file to an empty root-only placeholder before the next restart.

Re-running the installer for an already installed version only synchronizes the corresponding systemd unit and runs `daemon-reload`; it does not modify the release, `current` symlink, or service state. Review the unit diff, then use `sudo systemctl restart stackpilot-controller` or `sudo systemctl restart stackpilot-agent` during a controlled maintenance window and verify readiness.

Install the nginx example after replacing every `.invalid` hostname and certificate path. Controller remains on `127.0.0.1:8787`; nginx is the only public listener. Bind Agent port 9443 to a private management address and allow only enrolled node networks at the firewall.

```bash
sudo nginx -t
sudo systemd-analyze verify deploy/systemd/*.service
sudo systemctl enable --now stackpilot-controller nginx
sudo systemctl enable --now stackpilot-agent
sudo systemctl show stackpilot-controller -p User -p Group -p NoNewPrivileges
```

Both services use distinct non-root users, empty capability sets, restricted filesystems and owner-only state directories. No sudoers entry is required by the two supported read-only Agent tasks.
