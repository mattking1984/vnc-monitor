#!/bin/bash
# Run on the teacher Pi. Applies the WayVNC auth fix to every station in
# config.json: disables the built-in Screen Sharing feature's RSA-AES/PAM
# auth (security types asyncvnc can't negotiate) so it falls back to open
# access, matching the working home setup.
set -uo pipefail

USERNAME="student"
CONFIG="$(dirname "$0")/../config.json"

ips=$(python3 -c "
import json
with open('$CONFIG') as f:
    data = json.load(f)
seen = set()
for s in data['stations']:
    if s['ip'] not in seen:
        seen.add(s['ip'])
        print(s['ip'])
")

fail=0
for ip in $ips; do
    echo "=== $ip ==="
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \
        "$USERNAME@$ip" '
            sudo sed -i "s/enable_auth=true/enable_auth=false/" /etc/wayvnc/config &&
            sudo systemctl restart wayvnc-control.service &&
            sudo systemctl restart wayvnc.service &&
            echo "  OK"
        '; then
        :
    else
        echo "  FAILED: $ip"
        fail=$((fail+1))
    fi
done

echo
echo "Done. $fail failure(s)."
