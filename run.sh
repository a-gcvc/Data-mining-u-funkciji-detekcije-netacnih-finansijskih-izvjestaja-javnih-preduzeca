#!/usr/bin/env bash
# Pokreće backend (i frontend preko static mount-a) na http://127.0.0.1:8000
set -e
cd "$(dirname "$0")/backend"
uvicorn main:app --reload
