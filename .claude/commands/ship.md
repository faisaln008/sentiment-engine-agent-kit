---
description: Final docs + clean-clone verification + submission checklist
---
1. Delegate to **docs-writer**: write/refresh README.md, SETUP.md, ARCHITECTURE.md, AI_COLLABORATION.md from evidence only.
2. Clean-clone test (you run it):
   ```
   rm -rf /tmp/cc && git clone . /tmp/cc && cd /tmp/cc && npm install && cp .env.example .env && (npm start &) && sleep 4 \
   && curl -s -X POST localhost:3000/api/telemetry/stream -H 'content-type: application/json' -d @apps/backend/eval/fixtures/sample-chunk.json
   ```
   It must return a schema-valid response **with no API key set** (heuristic mode). Kill the server afterwards.
3. Verify the submission checklist in `docs/PLAYBOOK.md` §6 item by item, with evidence.
4. `git grep -nE "gsk_|AIza|sk-[A-Za-z0-9]{20}|csk-"` must return nothing; `git status` clean; `docs/assignment/` not tracked.
5. Output the walkthrough-video outline (≤ 5 min) from PLAYBOOK §7 filled with real numbers.
