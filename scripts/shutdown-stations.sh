#!/bin/bash
# Run on the teacher Pi. Shuts down every station listed in config.json.
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

for ip in $ips; do
    echo "Shutting down $ip..."
    ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \
        "$USERNAME@$ip" 'sudo shutdown -h now' &
done
wait
echo "Shutdown sent to all stations."
