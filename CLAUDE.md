# adem — Claude Code instructies

> **Machine-breed:** `~/.claude/CLAUDE.md`. **Domein:** Persoonlijk & Web (Vercel-hosting).
> **Start via** `orin3` → window `adem`.

Openbare (MIT) HRV-biofeedback-app, statisch, geen build-stap; Vercel-project gekoppeld aan
`adem.felixisfelix.com` (DNS bij Cloudflare, CNAME → cname.vercel-dns.com). Tests:
`node tests/run.mjs`. Afgesplitst uit `derwisch-relay` (2026-10-10); het dashboard daar
neemt een vaste versie van `adem/` over en geeft via `globalThis.ADEM_STORE` een eigen opslag mee.
