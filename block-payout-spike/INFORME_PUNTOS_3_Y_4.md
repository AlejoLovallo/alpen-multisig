# Spike block_payout — cierre de los puntos 3 y 4

Fecha: 2026-10-29 · Rama: `spike/block-payouts-software-signing`

Este informe actualiza `GO_NO_GO.md` (2026-10-26) en dos de las cuatro preguntas del spike:

| # | Pregunta | Estado anterior | Estado ahora |
|---|---|---|---|
| 1 | ¿Se puede firmar en una hardware wallet? | Cerrada: **no** (informe entregado) | Sin cambios |
| 2 | ¿Armar y transmitir una transacción de prueba en local? | A medias: claves de software, Claim simulado | **Cerrada con un Claim real del grafo del bridge** (ver §3) |
| 3 | ¿El código del bridge entra en la app sin choque de dependencias? | A medias: solo en proyecto aparte, medido contra la app vieja | **Cerrada contra el release v0.4.1** (ver §1) |
| 4 | ¿De dónde sale cada dato? | No cumple | **Cerrada en lo verificable offline; quedan 4 fuentes sin conectar** (ver §2) |

Elegimos trabajar 3 y 4 porque la 4 es lo que convierte la 2 en una prueba sobre un Claim real y no sobre uno inventado por el spike.

---

## 1. Punto 3 — integración del código del bridge en la app

### Qué se midió

Sobre un worktree limpio del tag **v0.4.1** (`65a5f01`, release de hoy con ASM v0.5.0-rc.1) se agregaron `strata-bridge-connectors` y `strata-bridge-tx-graph` como dependencias de `orchestrator-be`, y se compiló con la toolchain propia de la app (`nightly-2026-07-01`).

### Resultado

| Pin | App v0.3.1 (medición vieja) | App v0.4.1 (hoy) | strata-bridge |
|---|---|---|---|
| `asm` | rev `b84eb28` (alpha.11) | `7ada090` = tag `v0.5.0-rc.1` | tag `v0.5.0-rc.1` |
| `strata-common` | rc23 | v0.4.0 | v0.4.0 |
| `ssz` | v0.16.0 | v0.17.0 | v0.17.0 |
| `bitcoin-bosd` | v0.11.0 | v0.12.0 | v0.12.0 |
| `bitcoin` (lock) | 0.32.10 | 0.32.10 | 0.32.10 |
| `secp256k1` | 0.29.1 | 0.29.1 | 0.29.1 |

El choque de `bosd`, `strata-common`, `ssz` y `asm` que anotaba el informe anterior **ya no existe**: los pins coinciden.

### Hallazgo nuevo: duplicado silencioso de ASM

Con las dependencias agregadas tal cual, `cargo check` pasó, pero `cargo tree -d` mostró **cada crate de ASM dos veces** (`strata-asm-common`, `-bridge-types`, `-manifest-types`, `-state`, `-proto-bridge-txs`, `strata-btc-verification`). Es el mismo commit `7ada090`, pero la app lo fija con `rev = "..."` y el bridge con `tag = "v0.5.0-rc.1"`. Cargo trata ambas formas como fuentes distintas, así que los tipos no unifican. Compila hasta que un tipo de ASM cruza la frontera app↔bridge.

**Corrección:** cambiar en `Cargo.toml` raíz (10 líneas) y en `e2e-tests/Cargo.toml` (8 líneas) `rev = "7ada09…"` por `tag = "v0.5.0-rc.1"`. Después: una sola versión de cada crate de ASM en `Cargo.lock`, y `cargo metadata` sin error.

### Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `cargo check -p orchestrator-be` con las dependencias del bridge | OK (47 s) |
| `cargo check -p desktop-app` | OK (33 s) |
| `cargo tree -d` antes de alinear `rev`→`tag` | 6 crates de ASM duplicados |
| `cargo tree -d` después de alinear | Sin duplicados de ASM, `ssz`, `bosd`, `strata-*`. Quedan `bitcoin_hashes`, `bitcoin-units` y dos versiones de `musig2`, que vienen del ecosistema y no de nuestras dependencias |
| `Cargo.lock`: versión única de `bitcoin`, `secp256k1`, `bitcoin-bosd`, `ssz` | OK |

Parche aplicado: `evidence/app-v0.4.1-integration.patch` (solo los `Cargo.toml`; el `Cargo.lock` crece unas 430 líneas).

### Lo que NO se verificó

- `cargo test --workspace`, `cargo clippy -- -D warnings` y `cargo deny` sobre el workspace con las dependencias nuevas. Son parte del checklist de CI del repo y están pendientes.
- El bridge entra por **ruta local** (`../../strata-bridge`). Para el producto hay que fijarlo por git (tag o rev). El checkout local está en `fbcf94f8` (16-oct); no se comprobó que sea la última versión upstream.
- Nada de esto se integró en una rama de la app: se probó en un worktree descartable.
- Compila un warning de deprecación en `tx-graph` (`FeeRate::from_sat_per_vb_unchecked`), propio del bridge.

---

## 2. Punto 4 — de dónde sale cada dato

### Hallazgo principal

El spike anterior concluyó que «no hay RPC que devuelva un AdminBurn sin firmar» y que había que armar todo a mano. Eso sigue siendo cierto, pero **la materia prima sí está publicada**: el RPC de disponibilidad de datos `stratabridge_graphData(graph_idx)` devuelve `RpcGraphData { context: GraphSMCtx, setup: SetupParams, deposit: DepositParams }`. `SetupParams.keys` contiene exactamente lo que necesita el conector:

- `n_of_n_pubkey` (clave interna del taproot)
- `admin.pubkeys` y `admin.threshold`
- `unstaking_image`

### Tabla de fuentes (verificada contra un Claim real)

| Campo | Fuente | Verificado |
|---|---|---|
| Clave interna N/N | `graphData.setup.keys.n_of_n_pubkey` (también `context.covenant.aggregate_pubkey`) | Sí |
| Claves de admin + orden + umbral | `graphData.setup.keys.admin`, **contrastado con un set fijado fuera de banda** (`params.toml [keys.admin]`) | Sí, incluido el caso de orden alterado |
| `unstaking_image` | `graphData.setup.keys.unstaking_image` (también `context.unstaking_image`) | Sí, incluido el caso de imagen falsa |
| Red | Configuración de la app | Sí |
| `claim_txid` | Se recalcula con `GameGraph::new(graphData + params del protocolo)`; coincide con el txid en cadena | Sí |
| Salida a gastar | `ClaimTx::PAYOUT_VOUT = 1` del Claim confirmado | Sí |
| Validación final | El conector reconstruido debe ser **idéntico a la salida real** del Claim en cadena | Sí |

Regla de seguridad que surge de las pruebas: el set de admin publicado por los operadores **no es confiable por sí solo**. Se exigen dos controles antes de firmar: (a) igualdad con el set fijado por la app, y (b) igualdad del conector reconstruido con la salida en cadena. El segundo es el que detecta una `unstaking_image` falsa, que el primero no ve.

### Lo que sigue SIN fuente conectada

| Dato | Estado |
|---|---|
| Qué `graph_idx` corresponde al Claim falso | El RPC pide un `GraphIdx`; no se verificó cómo el administrador obtiene el índice a partir de una denuncia. El producto habla de «reportes de claim falso», sin formato definido. |
| Prueba / criterio de que el Claim es falso | Sin formato ni verificador definidos. |
| Entrada de comisión y cambio | El spike usa una moneda de bitcoind. La ruta real (Admin Wallet BIP-86) existe en la app pero no se conectó. |
| Mapeo del Admin ID `m/86'/0'/73'/0/0` a las claves de `keys.admin` | Sin especificar. |
| Parámetros de protocolo (`ProtocolParams`) | Necesarios solo para recalcular el `claim_txid` offline. Sensibles: cambiar un timelock cambia el txid (probado). Alternativa más simple: tomar el `claim_txid` de la cadena y validar con el control (b). |
| Respuesta de un nodo bridge **en vivo** | No se consultó. Se usó el mismo tipo `SetupParams` serializado a JSON, que es el que transporta el RPC, pero no una respuesta capturada. |
| `GraphSMCtx` (covenant, tabla de operadores) | No se instanció; el spike toma N/N y la imagen desde `setup.keys`, que el contexto duplica. |

---

## 3. Punto 2 — transacción de prueba sobre un Claim real

Lo que antes era un Claim inventado (una salida fondeada a mano con el mismo script) ahora es el **grafo de producción del bridge**.

### Prueba

`tests/real_claim_regtest.rs`, con `bitcoind` en regtest:

**Lado bridge** (hace de operadores):
1. Arma la transacción de fondeo (claim funds, depósito N/N, stake N/N).
2. Construye `GameGraph::new(GameData)` con 4 watchtowers, 4 admins y umbral 2.
3. Presigna el grafo con N/N, transmite el `ClaimTx` real con su hijo CPFP y mina un bloque.
4. Publica únicamente: el JSON de `SetupParams` (lo que devuelve `graphData`) y el Claim confirmado.

**Lado app** (`src/from_bridge.rs`): con solo ese JSON, el set de admin fijado y la red:
1. Parsea el JSON y compara el set de admin con el fijado.
2. Reconstruye el conector y lo compara con la salida 1 del Claim en cadena.
3. Arma el AdminBurn (versión 3), lo firman los admins 0 y 2 (saltando el 1) y lo transmite.
4. Bitcoin lo acepta y se confirma.

### Resultados

Comando: `cargo test --test real_claim_regtest -- --ignored --test-threads=1` → **4 passed, 0 failed (44 s)**.

| Test | Qué demuestra |
|---|---|
| `admin_burn_from_published_graph_data_spends_real_claim` | Flujo completo sobre un Claim real; el `claim_txid` recalculado coincide con el de cadena; AdminBurn aceptado y confirmado |
| `reordered_admin_keys_are_caught_before_signing` | Dos admins intercambiados: lo detectan el control (a) y el (b) |
| `wrong_unstaking_image_is_caught_by_chain_check` | Imagen falsa: el control (a) no lo ve, el (b) sí |
| `wrong_protocol_params_change_the_recomputed_claim_txid` | Un timelock distinto cambia el txid: los parámetros de protocolo deben ser exactos |

Regresión: `k_of_m_software` (3 passed) y `broadcast_regtest` (1 passed, 11 s) siguen verdes.

Restricción del protocolo descubierta al correr el grafo real: el stake total debe ser divisible por la cantidad de watchtowers (`slash.rs:83`). Con 3 watchtowers el grafo falla; el test usa 4.

### Qué sigue sin probarse

- **No se gastó un Claim de un bridge en ejecución.** Es un Claim real en cuanto a código y estructura (producido por el `GameGraph` de producción y aceptado por `bitcoind`), pero lo generó el propio test, con claves N/N y de admin aleatorias. Falta correrlo contra los functional tests del bridge (docker, SP1, FoundationDB) para ver al GSM reaccionar a `PayoutConnectorSpent`.
- La entrada de comisión es una moneda de `bitcoind`, no la Admin Wallet de la app.
- Las claves de admin son de software. La conclusión sobre hardware wallets no cambia (punto 1).

---

## 4. Estado final del spike

| Pregunta | Veredicto |
|---|---|
| 1. Hardware wallet | No: ni Ledger ni Trezor pueden firmar el script path (informe entregado) |
| 2. Armar y transmitir en local | **Sí, sobre un Claim del grafo real del bridge** |
| 3. Integración sin choque de dependencias | **Sí contra v0.4.1**, condicionado a alinear `rev`→`tag` de ASM. Faltan clippy, tests y `cargo deny` del workspace |
| 4. Origen de cada dato | **Mapeado y verificado para todo lo que arma la transacción.** Sin fuente: cómo se identifica el Claim falso, su prueba, la entrada de comisión real y el Admin ID |

### Próximos pasos sugeridos

1. Aplicar el cambio `rev`→`tag` en una rama de la app y correr el checklist de CI completo (`fmt`, `clippy -D warnings`, `test --workspace`, `cargo deny`).
2. Definir con el equipo del bridge cómo se obtiene el `graph_idx` a partir de una denuncia de Claim falso.
3. Repetir la prueba de §3 contra un nodo bridge de los functional tests, consumiendo `graphData` por RPC.
4. Fijar el bridge por git (no por ruta local) en el `Cargo.toml` de la app.

## Reproducir

```bash
cd alpen-multisig/block-payout-spike
cargo test --test k_of_m_software
cargo test --test broadcast_regtest -- --ignored
cargo test --test real_claim_regtest -- --ignored --test-threads=1
```

Requiere el código de `strata-bridge` como carpeta hermana (`../../strata-bridge`). `bitcoind` se descarga solo si no está en el PATH.
