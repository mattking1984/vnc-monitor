#!/bin/bash
# Run on the teacher Pi
cd "$(dirname "$0")"
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
cd frontend && npx serve -s build -l 3000
