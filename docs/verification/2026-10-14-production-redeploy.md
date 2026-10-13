# Existing-link production redeployment — 2026-10-14 Asia/Seoul

## Outcome and scope

The user explicitly requested redeployment after completion. The existing [student login](https://hanbit.thisis-joe.com/login) and [teacher login](https://hanbit.thisis-joe.com/staff/login) now serve the approved student character/equipment/reward/map and teacher-statistics implementation from product HEAD `88653a76882bbc5d6a976956bd66c77c96cc922f`, branch `feat/student-game-ui`, worktree `/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge`. Later verification-document-only commits do not change the deployed product source.

Hosting is the existing Colima Docker project `hanbit-prod`, loopback `127.0.0.1:8089`, behind its existing Cloudflare tunnel. Only backend and web were rebuilt/recreated. No DNS, tunnel configuration, database recreation, credential/account creation, push, PR or merge occurred. The primary checkout and older clean deployment checkout were not edited. XP, date-based unlock, immutable first correctness/pass/mastery and fifth-answer persistence logic were preserved. V1–V7 migrations/configuration matched the existing deployment; V8 adds only two appearance tables and constraints, without rewriting/deleting old learning facts.

Code acceptance and all nineteen chronological rulings/costs are in [combined verification](2026-10-13-teacher-learning-statistics.md). The additional modal-focus fix has a genuine permanent RED, 19/19 focused GREEN, 269/269 current frontend assertions, clean scoped review and 48/48 current Chromium cases. Existing unchanged backend evidence is 600 tests in 37 suites, with zero failures/errors/skips. Build, lint, strict E2E types, two asset-extraction cases, fifteen pinned graphics and 72 nonempty zero-difference artwork pairs passed. Tests were not re-run for this documentation-only closeout.

## Protected backup and rollback safeguards

Before deployment, one custom-format production `pg_dump` was made and validated using `pg_restore --list`, header, byte count and source/host checksum equality. No backup payload, credentials, cookie values or production student rows were emitted. Database version is 17.11. Backup bytes: **79,200**; file mode **600**, private parent **700**; SHA-256 `7ca7fbcb400ef0032fcda406ce496c9535648dd4e8e0a59cd32338fc1e6f0f87`.

The protected backup is retained in this plan's recoverable archive, not committed or baked into images:

`/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge/.superpowers/archive/2026-10-13-teacher-learning-statistics-88653a7/deployment-private.YEPvwy/production-predeploy.dump`

Only the validated temporary in-container dump was removed after its protected host copy was verified. `.dockerignore` excludes `.superpowers` and `.env*`. The existing mode-600 production env file was consumed by Compose without exposing or copying values.

| Saved rollback artifact | Immutable image ID |
| --- | --- |
| `hanbit-prod-web:rollback-20261014-88653a7` | `sha256:5038aff9c18af723a1e25a27447bf2ff7b7faa55a95c007e79945f9fc0cede37` |
| `hanbit-prod-backend:rollback-20261014-88653a7` | `sha256:5091fe4c76eaa23c22c611c166cc69d76ae8aa2cab14607ecb373c036325f2e4` |

The saved old backend actually booted against the already-owned synthetic QA database with V8; anonymous CSRF returned 200, the container stayed alive and no fatal category was observed. The future-migration warning was nonfatal. This probe exposed no ports or mounts and disabled expiry scheduling/admin bootstrap; no real production data was restored into QA. The exact owned temporary probe container was stopped/removed after validation, while the rollback image remained. This proves that startup configuration only, not every possible production rollback behavior. No rollback or destructive migration reversal was performed.

## Actual build and limited rollout

From the canonical current worktree:

```sh
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml build backend web
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml up -d --no-deps --wait --wait-timeout 90 backend web
```

Build exited **0** in **6,248ms** with eleven cached layers, with no build/dependency/space error category. Limited rollout exited **0** in **7,285ms**, with no unhealthy/space/port-conflict category. Actual services after rollout:

| Service | Container identity | Image/state |
| --- | --- | --- |
| Backend | `c0969aeabfe6f03852dfb29cd34c3228b619614d881575cb3c513a2edb8d1433` | `sha256:b1ab4777f129b2d98e90227d37fef0db311bb0065db857eadd64ca8d599263c5`; running, healthy |
| Web | `d24f8ca3bbde7d5d8f421ee306fa09ea58800ba12e85c23eae8c6a2513324dfa` | `sha256:043a54a1301f5c754723de3701b2a6df8523d552d0cbabcf614d496f789ec941`; running |
| Database — unchanged | `076b39c8cebd98e3574128354eb371f560ba80a127f3bf6ccd56176b755cf993` | existing `hanbit-prod_school-data` at `/var/lib/postgresql/data`; running, healthy |
| Tunnel — unchanged | `a5c23cf34de7517260e9ba37bdb4a1bbba8151e4284e1f735d94356a0339c5be` | running; existing read-only config/credential bindings preserved |

Fresh guards verified project/service/config/workdir labels, exact DB volume ownership, unchanged tunnel bindings, saved backup checksum and image identity. The DB retains an obsolete source-working-directory label, not an invalid volume identity; it was deliberately not reconciled/recreated. No prune or broad resource cleanup was performed despite 99% DB-disk usage (325,476KiB available at the recorded check).

Production backend image ID differs from the verified QA ID `sha256:c80e69f84ed120e281b96168978ead147147a9babfbbbd365220fe6b7bbda229`. Before proceeding, full inspection proved all **eight RootFS layers**, platform and complete image runtime configuration identical except expected Docker Compose metadata labels. Project labels alone change the image configuration digest. This is explicit artifact-equivalence evidence, not an unsupported same-source assumption. Production then used actual production configuration/secure defaults, not the QA profile, and passed the actual checks below.

One final read-only Docker metadata snapshot at **2026-10-13T23:41:45.323Z / 2026-10-14 08:41:45 KST** independently confirmed every listed project/service/container/image identity and runtime state, exact loopback web binding, unchanged DB volume and both original read-only tunnel bindings. No mismatches were found. Web and tunnel have no configured Docker healthcheck; their state is accurately reported as running, not Docker-healthy.

## Existing public link checks

HTTP checks completed at **2026-10-13T23:35:38.334Z** (**2026-10-14 08:35:38 Asia/Seoul**):

- Existing HTTPS root and localhost root both returned 200 with HTML SHA-256 `7e8310f0447943f2417796fe744ffeb9bc6d457e59ba9e758efee08be3b9e768` and exact `/assets/index-BwiIPEfW.js` reference. Public asset GET returned 200 with SHA-256 `1e754ca65c2b8161f173b89a5e451b9910be00e919365a592d38bef00883759c`, matching the current verified build. CSS is `index-C0WwsI2o.css`. Cloudflare root cache status was `DYNAMIC`, not a stale old index.
- `/login`, `/staff/login`, `/student/map`, `/student/character` and `/student/closet` returned the same current SPA entry (200). An entry response alone is not an authenticated feature-interaction claim.
- Actual canonical JSON shape is 30 days / 150 questions. All **300 nonempty question/explanation strings**, raw and JSON-escaped, were checked against the served JS with **zero matches**.
- `/api/auth/csrf` returned 200; the fresh cookie had **Secure, HttpOnly and SameSite=Lax**. Cookie/token values were not emitted. Anonymous `/api/student/game`, `/api/student/learning/map` and `/api/staff/classrooms` each returned 401. `/api/health` also returns 401 and was not represented as public health evidence.
- Actual production migration metadata was V1–V8, all successful; the two new appearance tables exist. Only schema metadata was read, not student rows. Backend health and unchanged DB/tunnel identities were verified.

A fresh anonymous headless browser completed at **2026-10-13T23:37:34.965Z**: **twelve rendered checks**, widths **360 and 1280**, on `/login`, `/staff/login`, `/student/character`, `/student/closet`, `/student/map` and `/staff/classrooms/deployment-smoke/learning`. Protected student routes redirected to `/login`, and the protected staff route to `/staff/login`; expected visible heading/inputs, **zero body overflow** and **zero page errors**. No user browser cookies, authentication, account creation, production learning writes, screenshots, traces, videos or raw DOM/DTO captures were used.

Public graphics completed at **2026-10-13T23:38:30.777Z**: all **fifteen** HTTPS PNG/WebP assets returned 200 and matched pinned local manifest SHA-256 and byte lengths, **zero mismatches**. Paths were validated against the actual manifest's `/game/` base, local regular/no-symlink files and canonical directory; bounded concurrent batches of four checked the same host. Nine characters and six scenes preserve the original pins.

## Chronology, residual risks and verification limits

Three collector/precheck mistakes stopped before their respective rollout/HTTP operations and were resolved from concrete read-only evidence, without product changes or additional backup/rebuild/test loops: the initial backup TOC matcher omitted the actual version-label colon; the initial rollout check required equal image IDs before full layers/config proved label-only differences; and the first public-image checker assumed root-relative paths while the manifest paths were relative to `/game/`. Static Java option warnings occurred in the rollback probe; the record is not described as pristine.

Two old intermittent issues remain unexplained and disclosed as nonblocking by source review: account-return unit navigation and a class-list/join-code timeout after successful POST201/GET200. Current passes do not prove their causes or remedies. The current frontend JSON report was safely parsed then narrowly removed; its file mode and aggregate file-message counts were not separately retained. No unknown output field is invented as zero.

Authenticated character/equipment/reward/map/statistics flows and restart persistence were exercised on synthetic QA fixtures. Production verification is artifact identity/equivalence, schema/health, anonymous rendered routing/security and public graphics, **not authenticated testing on real student learning records**. No push, PR, merge, new branch/worktree or additional product wave was authorized or performed. The named branch and host-managed worktree remain available for the user's integration decision.
