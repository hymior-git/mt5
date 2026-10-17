# BROKER INTEGRATION FEASIBILITY REPORT: MHT DEMO BROKER ON MT5 IOS

## 1. Executive Summary

This report evaluates the technical feasibility, protocol architecture, and system requirements for integrating an independently managed demo broker (**MHT Demo Broker**, Server **MHT-Demo-01**) into the modified MetaTrader 5 iOS terminal.

### Target Specifications:
- **Broker Name**: MHT Demo Broker
- **Server Name**: `MHT-Demo-01`
- **Account Type**: Demo
- **Default Balance**: $10,000 USD
- **Leverage**: 1:500 (0.2% margin requirement)
- **Primary Symbol**: `XAUUSD` (Spot Gold / US Dollar)
- **Required Operations**: Buy, Sell, Stop Loss (SL), Take Profit (TP), Equity, Margin, Floating P/L, Transaction History

### Key Verdict:
> [!IMPORTANT]
> **FEASIBILITY VERDICT: CONDITIONAL UPON OFFICIAL SERVER INFRASTRUCTURE**
> 
> The MetaTrader 5 iOS client **cannot** communicate with generic HTTP, REST, or WebSocket servers. The terminal's networking subsystem is a compiled, proprietary C++ engine communicating strictly over raw TCP using MetaQuotes' proprietary encrypted binary protocol (MTP).
> 
> Connecting an independently managed demo broker with full trading functionality (Buy/Sell, SL/TP, Margins, History) legitimately requires deploying **MetaTrader 5 Server Infrastructure** (Access Server + Trade Server) and registering the server points either through MetaQuotes' Central Directory or via local sandbox configuration.

---

## 2. MetaTrader 5 Network & Protocol Architecture

Through static analysis of `Payload/MetaTrader5Terminal.app/MetaTrader5Terminal` and reverse engineering of the networking subsystem, the terminal's communication layer was analyzed:

### 2.1 Transport Layer
- **Protocol**: Raw TCP (Transmission Control Protocol).
- **Default Ports**: `443` (encapsulated over TLS or proprietary framing on standard HTTPS port), `1980`, `1981`, `1982`.
- **Absence of Open APIs**: The client binary contains no web-based middleware, REST API adapters, or WebSocket interfaces for trade routing.

### 2.2 Cryptographic Handshake & Framing
1. **Asymmetric Key Exchange**: The client terminal initiates a connection to an MT5 Access Server. The server presents public key certificates issued under the MetaQuotes Root PKI.
2. **Ephemeral Session Key**: The client and server perform a cryptographic key exchange (Diffie-Hellman / RSA variant) to establish an ephemeral symmetric encryption key.
3. **Binary Framing & Compression**: All subsequent traffic (symbol quotes, order placement, margin calculations, account status) is encapsulated in binary structures, compressed using MetaQuotes' proprietary LZ algorithm, and protected with HMAC integrity checks.
4. **Challenge-Response Authentication**: Client logins do not transmit plaintext passwords. The server issues a cryptographic salt/challenge, and the client returns a salted hash computed from the trader's password.

### 2.3 Why Generic Web Servers (REST/WebSocket) Cannot Work
Attempting to connect a standard Node.js, Python, or Go server exposing REST or WebSockets directly to the MT5 terminal will fail immediately at the transport layer:
- The MT5 terminal will send binary protocol synchronization packets, not HTTP `GET` / `POST` or WebSocket upgrade requests.
- A REST or WebSocket server will reject the binary handshake as malformed HTTP syntax.
- The MT5 terminal will log a socket connection failure or protocol handshake error and terminate the connection.

---

## 3. Broker Discovery & Directory Architecture

In the MT5 iOS terminal, the server selection workflow operates through two distinct mechanisms:

```
[User Enters "MHT" in Terminal Search]
                 │
                 ▼
     [CViewServers / SearchLocalServer]
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
[Local servers.dat]   [Network Search Request]
 (Sandbox Cache)            │
                            ▼
              [access.metatrader5.com:443]
               (Central Directory Service)
                            │
                            ▼
              [MetaQuotes Directory Database]
                            │
               Returns Broker Records:
               - Company Name: "MHT Demo Broker"
               - Server: "MHT-Demo-01"
               - Access Points: IP:Port list
               - Public Keys & Certificates
               - Server Flags: isDemo = 1
```

1. **Local Search (`SearchLocalServer:`)**: Queries the locally cached `servers.dat` file in the application's sandbox container.
2. **Remote Directory Search (`SearchRequest:Results:`)**: Sends an encrypted query packet to MetaQuotes' centralized Server Directory cluster at `access.metatrader5.com:443`.
3. If a broker name or server is not registered in the MetaQuotes central directory and is not present in local `servers.dat`, the search returns zero results.

---

## 4. Legitimate Integration Pathways for "MHT Demo Broker"

To legitimately integrate `MHT Demo Broker` with server `MHT-Demo-01` into MetaTrader 5 without modifying live broker authentication or impersonating third parties, the following pathways exist:

### Pathway 1: Licensed MetaTrader 5 Server Cluster (Standard Production Path)

This is the official, supported industry standard for any brokerage operating on MetaTrader 5:

#### Required Infrastructure Components:
1. **MT5 Access Server**: Positioned in a public DMZ (e.g., ports 443 and 1980). Terminates client TCP connections, executes cryptographic handshakes, and routes encrypted packets.
2. **MT5 Trade Server**: Core transaction engine. Maintains the account balance, floating P/L, margin calculation, and position database.
3. **MT5 History Server**: Stores tick-by-tick and bar history for `XAUUSD`.
4. **MetaTrader 5 Administrator**: Server management software used to configure the broker parameters.

#### Server Configuration Steps for MHT Demo Broker:
- **Company Profile**:
  - Name: `MHT Demo Broker`
  - Server Identifier: `MHT-Demo-01`
- **Demo Group Setup** (`demo\mht-standard`):
  - Currency: `USD`
  - Default Leverage: `1:500`
  - Margin Calculation Mode: `Forex / CFD`
  - Pre-allocated Balance: `$10,000`
  - Execution: `Market Execution` or `Instant Execution`
- **Symbol Configuration (`XAUUSD`)**:
  - Symbol: `XAUUSD` (Gold vs US Dollar)
  - Contract Size: `100` (1 lot = 100 troy ounces)
  - Currency Margin: `USD`, Currency Profit: `USD`
  - Digits: `2` (e.g., $2,350.50)
  - Tick Size: `0.01`
  - Tick Value: `$1.00` per lot per tick
  - Margin Rate: `0.002` (corresponding to 1:500 leverage; requires $470.10 margin for 1 lot at $2,350.50)
  - Trade Permissions: Full access (`Buy`, `Sell`, `Close`, `Modify`, `SL`, `TP`)
- **Central Directory Registration**:
  - The broker registers its server access points (`IP:Port`) with MetaQuotes Software Corp.
  - MetaQuotes distributes the public key and server configuration to `access.metatrader5.com`.
  - Every MT5 terminal worldwide (including our custom `net.metaquotes.MetaTrader5Terminal1`) can instantly discover and connect to `MHT Demo Broker`.

---

### Pathway 2: Pre-Seeded `servers.dat` in App Sandbox (Local Access Point Injection)

If an authorized MT5 Server cluster (`MHT-Demo-01`) has been deployed by the brokerage but is not yet publicly registered in MetaQuotes' global directory:

1. **Generation of Server Record**:
   - The MT5 Administrator console exports the server network access record into `servers.dat` format.
   - This record contains the server name `MHT-Demo-01`, company name `MHT Demo Broker`, access point IP addresses, ports, and public encryption keys.
2. **Pre-Seeding into Application Sandbox**:
   - When the application is packaged or installed, the compiled `servers.dat` is placed into the application's `Library/Application Support/` or App Group container directory.
   - Upon launch, `CViewServers` reads `servers.dat` and populates `MHT Demo Broker` directly into the terminal's local server list without querying `access.metatrader5.com`.
3. **Execution**:
   - The user opens the app, selects `MHT Demo Broker`, enters their demo login and password, and connects directly to `MHT-Demo-01`.

---

## 5. Unofficial / Alternative Approaches & Their Fatal Technical Obstacles

| Approach | Architecture | Technical Feasibility | Fatal Obstacles & Constraints |
| :--- | :--- | :---: | :--- |
| **Generic REST API Gateway** | Emulating server via web service | **IMPOSSIBLE** | MT5 client networking is pure binary TCP; no HTTP/REST interfaces exist in the client. |
| **Generic WebSocket Server** | Connecting via browser socket | **IMPOSSIBLE** | MT5 does not use WebSocket protocol for trade execution. |
| **Reverse-Engineered Protocol Emulator** | Custom binary TCP server imitating MT5 server | **NON-VIABLE / PROHIBITED** | 1. MetaQuotes proprietary cryptographic key exchange requires server-side private keys matching client root certificates.<br>2. Proprietary compression and binary packet schemas change between builds.<br>3. High risk of authentication failure and unstable connections.<br>4. Exceeds standard engineering boundaries without an official server license. |
| **Impersonating Existing Broker** | Modifying DNS/hosts to redirect legitimate broker traffic | **STRICTLY PROHIBITED** | 1. Explicitly barred by user mandate ("Do not impersonate an existing broker or modify live broker authentication").<br>2. TLS certificate validation and asymmetric server signature verification prevent traffic interception. |

---

## 6. Synthesis & Recommended Implementation Plan

To achieve the desired functional setup:
1. **Application Identity**: The repackaged IPA `MT5_Custom_BundleID1.ipa` provides the independent application identity (`net.metaquotes.MetaTrader5Terminal1`), enabling side-by-side installation on iOS.
2. **Server Infrastructure**: To connect to **MHT Demo Broker** (`MHT-Demo-01`), the organization must operate or partner with a provider running a licensed **MetaTrader 5 Server**.
3. **Server Setup**:
   - Create Trade Server instance `MHT-Demo-01`.
   - Configure Demo group with $10,000 deposit and 1:500 leverage.
   - Configure `XAUUSD` contract specifications and trading permissions.
4. **Client Connection**:
   - For public access: Register the server points with MetaQuotes Directory.
   - For private testing: Deploy the server's network record into the app's sandbox `servers.dat`.
