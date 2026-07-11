#!/bin/sh
set -eu
mode=${1:-program-only}
systemctl disable --now stackpilot-controller.service stackpilot-agent.service 2>/dev/null || true
rm -rf /opt/stackpilot /opt/stackpilot-agent
if [ "$mode" = "destroy-data" ]; then
  [ "${STACKPILOT_CONFIRM_DESTROY:-}" = "DESTROY-STACKPILOT-DATA" ] || { echo "Refusing data destruction without STACKPILOT_CONFIRM_DESTROY=DESTROY-STACKPILOT-DATA" >&2; exit 1; }
  rm -rf /var/lib/stackpilot-controller /var/lib/stackpilot-agent /etc/stackpilot /etc/stackpilot-agent
elif [ "$mode" != "program-only" ]; then echo "Usage: uninstall.sh [program-only|destroy-data]" >&2; exit 1; fi
