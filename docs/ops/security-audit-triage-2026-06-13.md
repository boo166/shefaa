# Security Audit Triage

Date: 2026-06-13  
Source: `npm audit --json`  
Gate: **PASS**

## Summary

| Severity | Count |
|----------|------:|
| critical | 2 |
| high | 11 |
| moderate | 7 |
| low | 1 |
| **total** | 21 |

Remediation required before production: **0 critical**, **0 high** (reachable).  
Dev-only / transitive documented: **30**.

## Triage Matrix

| Package | Severity | Reachable? | Fix available? | Mitigation | Decision |
|---------|----------|------------|----------------|------------|----------|
| @vitest/coverage-v8 | critical | no | yes | npm audit fix / upgrade | DOCUMENT |
| vitest | critical | no | yes | [advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-pf86-5x62-jrwf) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-pjwm-pj3p-43mv) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-777c-7fjr-54vf) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-3g43-6gmg-66jw) | DOCUMENT |
| axios | high | no | yes | [advisory](https://github.com/advisories/GHSA-35jp-ww65-95wh) | DOCUMENT |
| esbuild | high | no | yes | [advisory](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | DOCUMENT |
| flatted | high | no | yes | [advisory](https://github.com/advisories/GHSA-25h7-pfq9-p65f) | DOCUMENT |
| flatted | high | no | yes | [advisory](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) | DOCUMENT |
| glob | high | no | yes | [advisory](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | DOCUMENT |
| lodash | high | no | yes | [advisory](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | DOCUMENT |
| lovable-tagger | high | no | yes | npm audit fix / upgrade | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-7r86-cg39-jmmj) | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | DOCUMENT |
| minimatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | DOCUMENT |
| picomatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | DOCUMENT |
| picomatch | high | no | yes | [advisory](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | DOCUMENT |
| rollup | high | no | yes | [advisory](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) | DOCUMENT |
| supabase | high | no | yes | npm audit fix / upgrade | DOCUMENT |
| tar | high | no | yes | [advisory](https://github.com/advisories/GHSA-9ppj-qmqm-q256) | DOCUMENT |
| ajv | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-3w6x-2g7m-8v23) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-445q-vr5w-6q77) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-m7pr-hjqh-92cm) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-vf2m-468p-8v99) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-xx6v-rp6x-q39c) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-62hf-57xw-28j9) | ACCEPT |
| axios | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-898c-q2cr-xwhg) | ACCEPT |
| brace-expansion | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | ACCEPT |
| brace-expansion | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | ACCEPT |
| brace-expansion | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | ACCEPT |
| brace-expansion | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2) | ACCEPT |
| esbuild | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | ACCEPT |
| js-yaml | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-mh29-5h37-fv8m) | ACCEPT |
| lodash | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-f23m-r3pf-42rh) | ACCEPT |
| lodash | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | ACCEPT |
| picomatch | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | ACCEPT |
| picomatch | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | ACCEPT |
| postcss | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | ACCEPT |
| vite | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-93m4-6634-74q7) | ACCEPT |
| vite | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | ACCEPT |
| ws | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | ACCEPT |
| yaml | moderate | no | yes | [advisory](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) | ACCEPT |
| @tootallnate/once | low | no | yes | [advisory](https://github.com/advisories/GHSA-vpq2-c234-7xj6) | ACCEPT |
| axios | low | no | yes | [advisory](https://github.com/advisories/GHSA-xhjh-pmcv-23jw) | ACCEPT |
| vite | low | no | yes | [advisory](https://github.com/advisories/GHSA-g4jq-h2w9-997c) | ACCEPT |
| vite | low | no | yes | [advisory](https://github.com/advisories/GHSA-jqfw-vq24-v9c3) | ACCEPT |

## Remediation Plan

| Priority | Action | Owner | Status |
|----------|--------|-------|--------|
| P0 | Resolve all REMEDIATE critical/high reachable packages | Engineering | PENDING |
| P1 | Run `npm audit fix` and re-run triage | Engineering | PENDING |
| P2 | Document ACCEPT/DOCUMENT exceptions with ADR | Security | PENDING |

## Sign-Off

- [ ] Zero reachable critical vulnerabilities
- [ ] Zero reachable high vulnerabilities (or documented exception)
- [ ] `npm run ops:security-audit` secrets/edge gate PASS
- [ ] RLS report run on target environment
