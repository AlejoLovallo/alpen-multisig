# GO / NO-GO — block_payout without hardware wallet

> **Actualización 2026-10-29:** la tabla «Parent workspace extra check» y el mapa de datos están superados por [`INFORME_PUNTOS_3_Y_4.md`](INFORME_PUNTOS_3_Y_4.md). Contra el release v0.4.1 los pins de la app ya coinciden con los del bridge.

Spike crate: `alpen-multisig/block-payout-spike/`
Date: 2026-10-26

Hardware wallets are **out of scope** (Trezor/Ledger cannot sign the AdminBurn script path). This document answers the remaining Stage 1 questions with software keys.

## Verdict

**GO for a software-key Payout Administrator path.**

A 2-of-3 set of independent software signers can construct, sign, finalize, and broadcast an `AdminBurnTx` (`block_payout`) using the real `strata-bridge` APIs. Do **not** merge those crates into the parent `alpen-multisig` workspace until pinsets are aligned.

| Question (Light Stage 1) | Result |
|---|---|
| Hardware-wallet signing of AdminBurn | N/A — decided out. Stock HW cannot. |
| Build + broadcast a real local test tx | **GO** — `cargo test --test broadcast_regtest -- --ignored` |
| Integrate Alpen bridge code without dep issues | **GO in an isolated crate.** **NO-GO as a parent workspace member** today. |
| Where data comes from to build each input | **Mapped** (see below). Production sources are not wired; spike uses fixtures. |

## Evidence

### Software K-of-M signing — GO

```bash
cd alpen-multisig/block-payout-spike
cargo test --test k_of_m_software
# 3 passed: 2-of-3 consecutive, 2-of-3 skipping middle signer, 1-of-3 panics
```

Each admin calls `SoftwareAdminSigner::sign` with the same `SigningInfo` (BIP-341 script-path, untweaked BIP-340). Witness layout matches upstream: descending pubkey index, empty pushes for missing keys, leaf script, 65-byte control block. Tx version 3.

### Path-deps on strata-bridge — GO (isolated crate)

`Cargo.toml` path-depends on:

- `../../strata-bridge/crates/connectors`
- `../../strata-bridge/crates/tx-graph`

Compile succeeded on `nightly-2026-09-01` (bridge toolchain). First `cargo test` compiled 277 packages, including `AdminBurnTx` / `ClaimPayoutConnector`.

The spike is **excluded** from the parent workspace (`exclude = ['block-payout-spike']`) and has its own `[workspace]`.

### Broadcast on regtest — GO

```bash
cargo test --test broadcast_regtest -- --ignored --nocapture
# software_k_of_m_broadcasts_admin_burn ... ok  (~11s)
```

Flow: fund a fake Claim with the payout connector at **vout 1**, 2-of-3 software-sign AdminBurn, wallet-sign the fee coinbase, `sendrawtransaction`, mine, `getrawtransaction`. This machine had no `bitcoind` on PATH; `corepc-node` feature `download` supplied Bitcoin Core 30.2.

### Stretch: live strata-bridge node — not run

Not required to answer the three remaining questions. Upstream already has `admin_burn_payout` (tx-graph) and GSM `PayoutConnectorSpent`. A docker/functional-test Claim burn is a Stage 2 integration item.

## Parent workspace extra check (Stage 2 risk)

Do **not** add `strata-bridge-tx-graph` as an `alpen-multisig` workspace member without a dedicated pin bump. Observed lockfile clash:

| Crate | Parent `alpen-multisig` | Spike / `strata-bridge` |
|---|---|---|
| `bitcoin` | 0.32.10 (`Cargo.toml` asks 0.32.6) | 0.32.102 (`Cargo.toml` asks 0.32.9) |
| `secp256k1` | 0.29.1 | 0.29.1 |
| `bitcoin-bosd` | git tag **v0.11.0** (+ crates.io 0.9.0) | git tag **v0.12.0** |
| `strata-common` (`strata-crypto`) | tag **v0.1.0-alpha-rc23** | tag **v0.4.0** |
| `ssz` | **v0.16.0** | **v0.17.0** |
| `alpenlabs/asm` | rev `b84eb28` (v0.1-alpha.11) | tag **v0.5.0-rc.1** |
| rustc | nightly-2026-01-01 | nightly-2026-09-01 |

`bitcoin` 0.32.x can likely unify. `bitcoin-bosd`, `strata-common`, `ssz`, and `asm` cannot: they are different tags and would duplicate types or fail resolution. That is the real Stage 2 integration blocker, not AdminBurn crypto.

## Data map (question Light #4)

| Artifact | Spike (mock) | Production source today | Gap |
|---|---|---|---|
| Admin x-only pubkeys + threshold | `SpikeFixture` 2-of-3 software keys | `params.toml` `[keys.admin]` | No loader in alpen-multisig. Order is consensus-critical (`pubkey_index`). |
| Operator N/N internal key | Random keypair in fixture | Operator-set aggregate in the game graph | Must match the Claim's taproot internal key. |
| `unstaking_image` | SHA-256 of random preimage | Per-graph unstaking image | Wrong image → wrong tap tree → invalid spend. Unused by AdminBurn witness but part of connector identity. |
| `claim_txid` / connector outpoint | Dummy txid (unit) or funded tx with connector at **vout 1** (regtest) | Claim tx on L1; `ClaimTx::PAYOUT_VOUT = 1` | No indexer. Product wants false-claim reports → outpoints. |
| Fee input + change | Dummy P2TR (unit) or bitcoind wallet coinbase (regtest) | Admin Wallet BIP-86 | Product path exists in desktop wallet; spike does not use it. |
| Sighash | `AdminBurnTx::signing_info_partial()` after fees are fixed | Same API | Re-sign if fee rate / inputs change. |
| False claim proof | Not used | Unspecified format | Stage 2. UI mock accepts any non-empty `proof`. |
| Orchestrator pending/quorum | In-process `collect_threshold` | Does not exist (`PayoutAdmin` auth is fail-closed vs ASM) | New resource, not `Proposal` + seqno. |
| Admin ID `m/86'/0'/73'/0/0` | Not used | PRD vs raw `keys.admin` | Mapping unspecified. |

There is **no** bridge RPC/duty/S2 method that returns an unsigned AdminBurn. Assembly is DIY from params + `claim_txid`.

## Blockers for Stage 2 (product)

1. **Pinset:** cannot drop bridge crates into the parent workspace without bumping asm / strata-common / bosd / ssz (or keeping a second isolated crate).
2. **Auth:** `Authority::PayoutAdmin` is unmapped to ASM and fail-closed. Membership is bridge-script keys, not ASM roles.
3. **False-claim proofs:** format and verifier undefined.
4. **Import/export wire format:** raw tx vs envelope with partial Schnorr sigs.
5. **Docs drift:** expiry 4 vs 7 days; auto-broadcast vs optional.
6. **Cooperative payout is not blocked** by AdminBurn (different UTXO). Product copy should not claim it stops all operator payouts.
7. **Hardware wallet:** still impossible on stock Trezor/Ledger. Software keys are the viable path this spike proved.
8. **No admin-burn RPC** on the bridge node.

# Strata bridge mockup reasons

The spike **does** use real `strata-bridge` crates (`ClaimPayoutConnector`, `AdminBurnTx`, sighash, witness). What is mocked is the **live bridge stack**: no operator nodes, Secret Service, FoundationDB, SP1, or a protocol `ClaimTx`.

That is intentional. Light Stage 1 asked whether we can **build, software-sign, and broadcast** an AdminBurn, and whether we can **depend on bridge code** without exploding the app workspace. It did not require proving the full claim-game on a running mosaic.

### Why not run the strata-bridge node

1. **Admin burn is already external to the node.** There is no `GraphDuty`, S2 stub, or RPC that returns an unsigned AdminBurn. Operators do not sign this path. A running bridge would only observe the spend on chain (`PayoutConnectorSpent`) after the fact.
2. **The pin clash is measured without a node.** Path-deps compile `tx-graph` / `connectors`. That is enough to know the app workspace cannot absorb them today.
3. **A fake Claim is enough for Bitcoin.** AdminBurn only needs the payout connector at **vout 1** of `claim_txid`. A locally funded taproot output with the same script is a consensus-valid spend. Contest connector, CPFP, MuSig2 presigns, and operator N/N as a live aggregate are irrelevant to “does bitcoind accept this witness?”.

### What stayed mocked (and why)

| Mock | Reason |
|---|---|
| Random admin keys, N/N, `unstaking_image` | Production values live in `params.toml` + per-graph stake data. No loader in alpen-multisig yet; wrong values only matter when spending a **real** Claim output. |
| Funded tx with connector at vout 1 (not `ClaimTx`) | Same tap tree / vout index `AdminBurnTx` expects. Avoids assembling the full game graph. |
| bitcoind wallet coinbase as fee | Product fee path is Admin Wallet BIP-86 (desktop). Out of spike scope; still a real L1 fee input. |
| In-process `collect_threshold` | Product coordination (orchestrator, several machines) is Stage 2. Crypto is the same: K independent `SigningInfo::sign` calls. |
| No false-claim proof | `verify_contest` / `verify_ack` are on draft bridge PR #800, not `main`. Format still unspecified in the app. |

### What is *not* a mock

- Script, tap tree, control block, BIP-341 script-path sighash, Schnorr signatures, version-3 tx.
- `bitcoind` mempool + mine on the ignored regtest test.
- Compile of real upstream crates (isolated workspace).

### When the live node *would* be required

Only for the stretch not done here: take a `claim_txid` from a running graph, rebuild the connector from **that** graph’s N/N + `[keys.admin]` + `unstaking_image`, burn it, and watch the bridge GSM abort. That is Stage 2 / S6 in the develop plan, not a blocker for the software-signing go.

To reproduce this spike you need the **source** of `strata-bridge` as a sibling path (`../../strata-bridge`). You do **not** need to start the node.

## What this spike is not

- Desktop app / Tauri / UI
- Orchestrator API or DB
- Persistent multi-machine coordination
- Protocol changes in `strata-bridge`
- A full pending/past/expiry product
