#!/usr/bin/env bash
# ram-fixes.sh: keep Caddy and wireproxy from eating all the RAM.
#
# Both are Go programs. With no memory limit, Go keeps growing its heap under
# load and barely hands memory back to the OS. On this box that pushed Caddy to
# ~2.4GB and wireproxy to ~2.3GB (RAM + swap), the server started thrashing swap,
# and Caddy fell behind accepting connections on :443.
#
# This sets a soft Go heap limit (GOMEMLIMIT) on each service through a systemd
# drop-in. Near the limit Go collects garbage harder and returns memory to the
# OS. It is a soft limit: nothing gets OOM-killed if traffic spikes past it.
#
# Safe to run repeatedly. Usage:
#   sudo ./ram-fixes.sh                 # apply and restart the services
#   sudo ./ram-fixes.sh --no-restart    # apply only; takes effect on next restart
#   CADDY_MEMLIMIT=1200MiB WIREPROXY_MEMLIMIT=500MiB sudo ./ram-fixes.sh
set -euo pipefail

CADDY_MEMLIMIT="${CADDY_MEMLIMIT:-900MiB}"
WIREPROXY_MEMLIMIT="${WIREPROXY_MEMLIMIT:-400MiB}"
RESTART=1
[[ "${1:-}" == "--no-restart" ]] && RESTART=0

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo $0 $*" >&2
  exit 1
fi

# write_limit <service> <limit> <reason>
write_limit() {
  local svc="$1" limit="$2" why="$3"
  if ! systemctl cat "$svc.service" >/dev/null 2>&1; then
    echo "skip $svc: service not installed"
    return 1
  fi
  local dir="/etc/systemd/system/$svc.service.d"
  mkdir -p "$dir"
  cat >"$dir/memory.conf" <<EOF
# Managed by ram-fixes.sh. $why
[Service]
Environment=GOMEMLIMIT=$limit
EOF
  # An older manual fix appended GOMEMLIMIT to override.conf; this file owns it now.
  if [[ -f "$dir/override.conf" ]] && grep -q 'GOMEMLIMIT' "$dir/override.conf"; then
    sed -i -e '/^# Soft Go heap limit/d' -e '/^# growing until the box swaps/d' \
      -e '/^Environment=GOMEMLIMIT=/d' "$dir/override.conf"
  fi
  echo "set $svc GOMEMLIMIT=$limit ($dir/memory.conf)"
}

changed=()
write_limit caddy "$CADDY_MEMLIMIT" "Caddy reached ~2.4GB RAM+swap without it." && changed+=(caddy) || true
write_limit wireproxy "$WIREPROXY_MEMLIMIT" "wireproxy reached ~2.3GB RAM+swap without it." && changed+=(wireproxy) || true

systemctl daemon-reload

if ((RESTART)) && ((${#changed[@]})); then
  # Restarting drops active proxy sessions for a few seconds; clients reconnect.
  # wireproxy first, so Caddy comes back to a working tunnel.
  for svc in wireproxy caddy; do
    [[ " ${changed[*]} " == *" $svc "* ]] || continue
    if [[ $svc == caddy ]] && command -v caddy >/dev/null; then
      cfg=$(systemctl show -p ExecStart --value caddy | grep -o -- '--config [^ ;]*' | head -1 | cut -d' ' -f2)
      if [[ -n "$cfg" ]] && ! caddy validate --config "$cfg" >/dev/null 2>&1; then
        echo "caddy config $cfg does not validate; not restarting caddy" >&2
        continue
      fi
    fi
    systemctl restart "$svc"
    echo "restarted $svc"
  done
  sleep 2
elif ((${#changed[@]})); then
  echo "not restarted; limits apply on the next restart of: ${changed[*]}"
fi

for svc in "${changed[@]}"; do
  pid=$(systemctl show -p MainPID --value "$svc")
  live=$(tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep '^GOMEMLIMIT=' || echo "GOMEMLIMIT not active yet")
  echo "$svc: $(systemctl is-active "$svc"), $live"
done
free -m
