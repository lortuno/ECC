# HOW_TO_MONITOR_SESSION_AGENTS.md

This repo records, for every Claude Code session, which model was used, how many tokens were consumed, how long the session ran, and which skills and subagents were invoked — automatically, in the background, indexed by timestamp. This guide explains where that data lives, how to view it, and how to query it at any point.

The system is four pieces, all built and tested in this repo: `scripts/hooks/cost-tracker.js`, `scripts/hooks/skill-run-tracker.js`, `scripts/hooks/agent-run-tracker.js`, and `scripts/hooks/session-rollup.js` — plus `scripts/sessions-report.js` for viewing the result.

---

## 1. What gets recorded, and where

Four JSONL sinks under `~/.claude/`, each written by a specific hook:

| Sink | Written by | Fires on | Contains |
|---|---|---|---|
| `metrics/costs.jsonl` | `cost-tracker.js` | `Stop` (after every assistant turn) | Cumulative tokens/model/cost for the session so far |
| `state/skill-runs.jsonl` | `skill-run-tracker.js` | `PostToolUse` on the `Skill` tool | `skill_id`, `skill_version`, `outcome` (no `session_id` — see limitation below) |
| `state/agent-runs.jsonl` | `agent-run-tracker.js` | `PostToolUse` on the `Task` tool | `agent_name`, `task_description`, `outcome`, `session_id` |
| `metrics/sessions.jsonl` | `session-rollup.js` | `Stop`, after `cost-tracker.js` | **One row per session** — everything above, joined |

`sessions.jsonl` is the one you actually read. It's not append-only — each Stop event **upserts** the row for the current session, so it stays current throughout a long session, not just at the end.

## 2. Prerequisites — the hooks must be enabled

None of this happens unless the hooks are wired into a `hooks` block somewhere Claude Code reads for your session — a project's `.claude/settings.local.json` (what this repo itself uses), or installed via `hooks/hooks.json` when ECC is loaded as a plugin. If you're setting this up in a different project, see `IMPORT_GUIDE.md`'s hooks section — don't hand-copy `hooks/hooks.json` wholesale; wire the four scripts directly:

```json
"hooks": {
  "Stop": [
    { "matcher": ".*", "hooks": [
      { "type": "command", "command": "node scripts/hooks/cost-tracker.js" },
      { "type": "command", "command": "node scripts/hooks/session-rollup.js" }
    ]}
  ],
  "PostToolUse": [
    { "matcher": "Skill", "hooks": [{ "type": "command", "command": "node scripts/hooks/skill-run-tracker.js" }] },
    { "matcher": "Task", "hooks": [{ "type": "command", "command": "node scripts/hooks/agent-run-tracker.js" }] }
  ]
}
```

`cost-tracker.js` must run **before** `session-rollup.js` in the same `Stop` array — the rollup reads the row cost-tracker just wrote.

There's no retroactive data: a session only appears in `sessions.jsonl` from the point these hooks were active onward.

## 3. Viewing results

### a) Quick table

```bash
node scripts/sessions-report.js
```

Real output, captured live from this actual session while writing this guide:

```
started_at                session_id    model            tokens  duration  cost_usd  agents  skills
------------------------  ------------  ---------------  ------  --------  --------  ------  ------
2026-09-25T18:07:10.895Z  58142110-24e  claude-sonnet-5  229256  0m        $12.5971  -       -
```

(`agents`/`skills` show as `-` here because neither tool had been invoked yet since the hooks were wired mid-session — see the canary check in section 5 to confirm they populate.)

### b) CSV export

```bash
node scripts/sessions-report.js --csv > sessions.csv
```

```
session_id,started_at,ended_at,duration_ms,model,input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,estimated_cost_usd,agents_used,skills_used
58142110-24e8-4f7d-892a-0ae876e48bd9,2026-09-25T18:07:10.895Z,2026-09-25T18:07:10.895Z,0,claude-sonnet-5,324,228932,578315,44306917,12.597139,-,-
```

Open this in any spreadsheet tool, or feed it to whatever BI/analytics setup you already have.

### c) Real SQLite database — for actual querying

```bash
node scripts/sessions-report.js --sqlite ~/.claude/metrics/sessions.db
```

This shells out to the system `sqlite3` binary (no npm dependency — this repo deliberately avoids native-addon packages like `better-sqlite3`; see `install.sh`'s own `--ignore-scripts` policy). It builds three tables: `sessions`, `agent_runs`, `skill_runs` (the latter two are the exploded per-agent/per-skill counts, so you can `GROUP BY` them). If `sqlite3` isn't on your PATH, the script tells you so and exits cleanly instead of failing obscurely.

## 4. Querying "at any point"

The `--sqlite` flag **rebuilds the database from the current `sessions.jsonl` every time you run it** — it's not a live-updating file. To query "as of right now," just re-run the export, then query with `sqlite3` directly:

```bash
node scripts/sessions-report.js --sqlite ~/.claude/metrics/sessions.db

# Total cost this week
sqlite3 ~/.claude/metrics/sessions.db \
  "SELECT ROUND(SUM(estimated_cost_usd), 2) FROM sessions WHERE started_at >= date('now', '-7 days');"

# Top 5 skills by run count, across all sessions
sqlite3 ~/.claude/metrics/sessions.db \
  "SELECT skill_id, SUM(run_count) AS total FROM skill_runs GROUP BY skill_id ORDER BY total DESC LIMIT 5;"

# Top 5 agents by run count
sqlite3 ~/.claude/metrics/sessions.db \
  "SELECT agent_name, SUM(run_count) AS total FROM agent_runs GROUP BY agent_name ORDER BY total DESC LIMIT 5;"

# Average session duration and cost, by model
sqlite3 ~/.claude/metrics/sessions.db \
  "SELECT model, COUNT(*), AVG(duration_ms)/60000.0 AS avg_minutes, AVG(estimated_cost_usd) FROM sessions GROUP BY model;"

# Every session from a specific day, most recent first
sqlite3 ~/.claude/metrics/sessions.db \
  "SELECT started_at, model, estimated_cost_usd FROM sessions WHERE started_at LIKE '2026-09-25%' ORDER BY started_at DESC;"
```

**If you don't want to touch SQLite at all**, the JSONL sinks are directly queryable with `jq` or plain Node, since `sessions.jsonl` is one JSON object per line:

```bash
# Total cost across every recorded session
jq -s 'map(.estimated_cost_usd) | add' ~/.claude/metrics/sessions.jsonl

# This session's row, pretty-printed
jq "select(.session_id == \"$CLAUDE_CODE_SESSION_ID\")" ~/.claude/metrics/sessions.jsonl
```

## 5. Verifying it's actually recording — the canary check

Structural presence of the JSONL files doesn't prove the pipeline is live end-to-end. Confirm it the same way this repo verifies everything else in this session-reporting system:

1. **Cost tracking**: finish a response (any response — `Stop` fires after every one), then check `~/.claude/metrics/costs.jsonl` for a new row with your real `session_id` (`echo $CLAUDE_CODE_SESSION_ID` to get it) and non-zero token counts.
2. **Skill tracking**: deliberately trigger a skill, then check `~/.claude/state/skill-runs.jsonl` grew by one line with that `skill_id`.
3. **Agent tracking**: explicitly delegate to a subagent (e.g. ask Claude to "use the `code-reviewer` agent on this file"), then check `~/.claude/state/agent-runs.jsonl` grew by one line with that `agent_name` and your session's `session_id`.
4. **Rollup**: after any of the above plus a completed turn, check `node scripts/sessions-report.js` shows your session with non-empty `agents`/`skills` columns once step 2 or 3 has happened.

If a step fails: re-check the hook wiring in section 2 — the most common cause is `cost-tracker.js` and `session-rollup.js` being wired in the wrong order, or a hook config change not taking effect until the next new session.

## 6. Known limitations

- **Skills are attributed to a session by time window, not an exact join.** `skill-run-tracker.js`'s persisted record has no `session_id` field (by original design — see its own test asserting exactly four fields), so `session-rollup.js` correlates a skill run to a session only if its timestamp falls between that session's first and last recorded cost-tracker row. This is a real approximation: two sessions running back-to-back with no gap could, in principle, misattribute a skill run at the boundary. Agent runs don't have this problem — `agent-run-tracker.js` records the real `session_id` directly.
- **Only explicit `Task`-tool delegation counts as an "agent used."** A skill that activates passively (matched by description, no delegation) shows up under `skills_used`, not `agents_used` — this is correct given what each mechanism actually is (see `HOW_TO_CREATE_AN_AGENT.md` vs `HOW_TO_CREATE_A_SKILL.md`), but it means "agents_used" is not a complete picture of every piece of ECC guidance that influenced a session.
- **Retention caps.** `sessions.jsonl` keeps the newest 2000 sessions; `skill-runs.jsonl`/`agent-runs.jsonl` keep the newest 5000 runs each. Older rows are pruned, oldest-first.
- **No data before the hooks were enabled.** Sessions that ran before this wiring existed have nothing recorded — there's no way to backfill from a transcript retroactively via this system.
- **`duration_ms` reflects wall-clock span between the first and last `Stop` event for a session**, not pure API/compute time — a session left open with long idle gaps between turns will show a proportionally longer duration.

## Checklist

- [ ] Hooks wired in the right order (`cost-tracker.js` before `session-rollup.js` under `Stop`)
- [ ] Canary check (section 5) confirms all four sinks actually populate for a real session
- [ ] `node scripts/sessions-report.js` shows your current session
- [ ] `--sqlite` export works (or you've confirmed `sqlite3` isn't installed and you're using `--csv`/`jq` instead)
- [ ] You know the two attribution limitations above before treating `skills_used` as exact
