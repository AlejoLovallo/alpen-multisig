# Resumen de ADRs — alpen-multisig

Documento para enviar. Cubre las siete Architecture Decision Records vigentes en `docs/architecture/adrs/` y, al final, las decisiones del spike de `block_payout` (aún no son ADRs formales).

Los pines concretos de ADR-001 (rev/tag) pueden estar desactualizados respecto de `Cargo.toml`; la **regla** (git deps, pin centralizado, nightly) sigue vigente. Hoy el workspace está en `alpenlabs/asm` `v0.1-alpha.11` (`b84eb28`) y `strata-common` `v0.1.0-alpha-rc23` (ADR-007).

---

## ADR-001 — Dependencias de crates Alpen/Strata

**Estado:** Accepted (partes superadas por revisiones posteriores y por ADR-007).

Los crates de Alpen no están en crates.io. Se consumen como **git dependencies**, pines en el `Cargo.toml` raíz (`[workspace.dependencies]`), miembros con `workspace = true`.

- Preferir **tag** a **rev**.
- Wire format de admin txs: **SSZ** (no Borsh). El sighash SPS-65 no cambió con esa migración.
- Todo el workspace usa **nightly** (deps transitivas de `ssz`). Es temporal: volver a stable cuando se pueda.
- `bitcoin` / `secp256k1` / `ssz` se alinean a las versiones del workspace Alpen para no duplicar tipos.
- `e2e-tests` es member del workspace (un solo pinset).

**Por qué importa para payouts:** meter `strata-bridge` (asm `v0.5.0-rc.1`, strata-common `v0.4.0`, bosd v0.12) en este workspace rompe esa regla. Por eso el spike vive en un crate aislado.

---

## ADR-002 — Capa de aplicación mínima

**Estado:** Accepted.

Orchestrator y desktop tienen una capa `application` que concentra lógica de negocio. Handlers/commands Tauri son delgados: parsear → llamar application → formatear.

Sin buses, event sourcing ni DDD táctico. Sin traits/ports hasta que el test o un swap lo exijan. Si `application.rs` pasa ~300 líneas, se parte por dominio.

El propio ADR marca: si Payout Admin diverge mucho del resto de autoridades, evaluar un **bounded context** aparte. Encaja con `block_payout` (no es SPS-65 ni ASM).

---

## ADR-003 — API de la capa de aplicación (desktop)

**Estado:** Accepted.

Vocabulario: el dominio coordina **proposals**; cada una envuelve un `MultisigAction`. La UI puede decir “updates”.

- La **authority va en la sesión**, no en cada call.
- La capa de aplicación **nunca ve claves privadas**. Recibe una firma ya hecha (HW en prod, software en tests).
- Consume tipos de dominio, no hex, en el diseño target. El POC todavía pasa `action_hex` + `seq_no`.
- Tipos de dominio propios, no los DTO HTTP del orchestrator.

Slice 5 (Payout Admin) queda explícito como “evaluar si esta API sirve o hace falta otro contexto”. Spoiler del spike: **no sirve** — no hay `seq_no` ni `MultisigAction`.

---

## ADR-004 — CI

**Estado:** Accepted.

GitHub Actions. Dos jobs en paralelo: **rust** (`fmt` → `clippy -D warnings` → `test` + e2e) y **frontend** (`prettier` → `eslint` → `tsc` + vite). Cache de Cargo y npm. CI en PRs y pushes a `develop` y `main`. Protección de rama en `develop` (jobs + 1 approval).

No `cargo audit` ni coverage ni matrix multi-OS en CI.

El spike **no** está en el workspace: `cargo test --workspace` del app no lo corre. Hay que ejecutarlo a propósito desde `block-payout-spike/`.

---

## ADR-005 — Arquitectura por capas

**Estado:** Implemented.

Tres/cuatro capas, dependencias hacia abajo:

`handlers/commands` → `application` → `domain` + `infrastructure`

- `domain/`: tipos puros, cero Axum/sqlx/reqwest.
- `application/`: lógica + traits (repos, clients).
- `infrastructure/`: implementaciones (Postgres, HTTP, bitcoind).
- `handlers/` (Axum) o `commands/` (Tauri): borde delgado.
- `main.rs`: composition root.

No Clean Architecture ni hexagonal completo. El único puerto formal es el trait de repositorio. Desktop y backend **no** comparten crate de tipos todavía.

El spike no entra en esas capas: crate aparte, sin orchestrator ni Tauri.

---

## ADR-006 — El backend solo coordina

**Estado:** Accepted.

El orchestrator **no** es la fuente de validez del protocolo SPS-65.

| Quién | Puede | No puede |
|---|---|---|
| Orchestrator | Sesión, persistir ciclo de vida, higiene SSZ/hex, `pending → approved` a pedido, metadata de broadcast | Auto-aprobar al llegar al quórum; ejecutar commit/reveal; ser prueba canónica on-chain |
| Desktop | Firmar (HW), ejecutar commit/reveal, pedir el PATCH a `approved` | Reimplementar reglas de threshold |
| React | UX | Claves, RPC Bitcoin |

`approved` es estado de coordinación, no prueba on-chain. `POST /approve` solo agrega firmas (sigue `pending`). Broadcast lo hace el desktop; el orchestrator refleja.

Payouts no usan este modelo: no hay `action_hex`, seqno ni commit/reveal. Hace falta otro recurso (tx Bitcoin + firmas Schnorr). No está diseñado ni implementado.

---

## ADR-007 — Pin de ASM para Security Council

**Estado:** Accepted. Aplica el procedimiento de ADR-001; no lo reemplaza.

Para tener `Role::StrataSecurityCouncil` y Defcon/Safe Harbour había que subir el pin. Se eligió **`v0.1-alpha.11` (`b84eb28`)** + strata-common `rc23` + ssz-gen `v0.16.0`.

Motivo principal: es el único tag con esas features que sigue en **Bitcoin Core 29.0**. Tags más nuevos exigen Core 30.2 y chocan con el feature `29_0` del workspace. El modelo de council es byte-idéntico hasta `v0.3.1`; subir más no suma features y obliga a migrar bitcoind/CI/staging.

Efecto colateral: el app queda **atrás de HEAD de asm**. El spike de payouts usa crates de `strata-bridge` ya en asm `v0.5.0-rc.1` / Core 30.2. Por eso no conviven en el mismo workspace.

---

## Cómo se leen juntos

```
ADR-001  cómo se pinea Alpen
   └── ADR-007  hasta dónde se pinea ASM (council, Core 29)
ADR-002  hay una capa application delgada
   └── ADR-003  su API habla de proposals / MultisigAction / sesión
   └── ADR-005  capas domain / application / infrastructure
ADR-006  orchestrator coordina; desktop ejecuta Bitcoin (gobernanza)
ADR-004  CI sobre ese workspace (no sobre el spike)
```

Payout Administrator **no entra** en 003/006: no es SPS-65. El pin de 007 **impide** absorber `strata-bridge` sin un bump deliberado (Core 30.2 + asm/ssz/bosd).

---

## Decisiones del spike `block_payout` (no son ADRs formales)

Para el reporte de avances. Pendiente de reproducir el e2e en máquina del equipo.

1. **Sin hardware wallet.** Stock Trezor/Ledger no firman el script-path AdminBurn (desk research, PR #600 / `docs/2-discovery/22-…`). El spike usa claves software.
2. **Crate aislado** (`block-payout-spike/`, `exclude` del workspace padre) en lugar de member o de vendor del subset. Path-dep a `strata-bridge-connectors` + `tx-graph`.
3. **No se toca desktop ni orchestrator.**
4. **No se levanta el nodo bridge.** Fixture local + bitcoind de `corepc-node`. El “claim” es una tx con el connector en vout 1, no un `ClaimTx` de operador.
5. **Datos mockeados:** keys admin, N/N, `unstaking_image`, fee coinbase, quórum in-process. Empírico: APIs reales de AdminBurn + (si el test ignorado corre) mempool/minado.
6. **Go preliminar:** firma K-of-M software y crate aislado. **No-go** meter bridge crates al workspace de la app con el pinset actual.

Detalle y comandos: `block-payout-spike/README.md` y `block-payout-spike/GO_NO_GO.md`.
