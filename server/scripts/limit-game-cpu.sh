#!/bin/sh
# Both this shell and systemd-run --scope exec their successor: Node keeps
# ownership of the same PID through to the native game.
set -eu
quota=${BROGUE_CPU_QUOTA_PERCENT:-20}
case "$quota" in
    ''|*[!0-9]*) echo 'Invalid Brogue CPU quota' >&2; exit 64 ;;
esac
if [ "$quota" -lt 1 ] || [ "$quota" -gt 100 ]; then
    echo 'Brogue CPU quota must be between 1 and 100' >&2
    exit 64
fi
if [ "$#" -eq 0 ]; then
    echo 'A game executable is required' >&2
    exit 64
fi
exec /usr/bin/systemd-run --user --scope --quiet --collect \
    --expand-environment=no "--property=CPUQuota=${quota}%" \
    --property=CPUQuotaPeriodSec=100ms -- "$@"
