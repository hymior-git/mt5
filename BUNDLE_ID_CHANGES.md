# BUNDLE IDENTIFIER MODIFICATION REPORT

## 1. Objective & Scope

The primary objective is modifying the application identity of MetaTrader 5 iOS from:
- **Original Bundle ID**: `net.metaquotes.MetaTrader5Terminal`
- **Target Bundle ID**: `net.metaquotes.MetaTrader5Terminal1`

The modification must allow the application to coexist alongside the original MetaTrader 5 application (dual/duplicate installation) while maintaining full application functionality, stability, and runtime integrity.

---

## 2. Modifications Applied

### 2.1 Main Application Property List (`MetaTrader5Terminal.app/Info.plist`)

The main bundle configuration was updated as follows:

```diff
--- Payload/MetaTrader5Terminal.app/Info.plist (Original)
+++ Payload/MetaTrader5Terminal.app/Info.plist (Modified)
@@ -88,4 +88,4 @@
     <key>CFBundleIdentifier</key>
-    <string>net.metaquotes.MetaTrader5Terminal</string>
+    <string>net.metaquotes.MetaTrader5Terminal1</string>
@@ -137,3 +137,3 @@
         <key>CFBundleURLName</key>
-        <string>net.metaquotes.MetaTrader5Terminal</string>
+        <string>net.metaquotes.MetaTrader5Terminal1</string>
```

#### Rationale:
1. `CFBundleIdentifier`: The authoritative operating system identifier for the application process, sandbox container, and security partition.
2. `CFBundleURLName`: The reverse-DNS identifier for the registered URL scheme (`metatrader5://`). Updated to match the new bundle identity.

---

### 2.2 App Extension Property List (`PlugIns/Share.appex/Info.plist`)

The Share extension bundle configuration was updated as follows:

```diff
--- Payload/MetaTrader5Terminal.app/PlugIns/Share.appex/Info.plist (Original)
+++ Payload/MetaTrader5Terminal.app/PlugIns/Share.appex/Info.plist (Modified)
@@ -16,4 +16,4 @@
 	<key>CFBundleIdentifier</key>
-	<string>net.metaquotes.MetaTrader5Terminal.Share</string>
+	<string>net.metaquotes.MetaTrader5Terminal1.Share</string>
```

#### Technical Mandate for App Extension Modification:
In iOS, application extensions run in separate processes spawned by system extension hosts. iOS installation daemons (`installd`, `mobile_installation`) and code signature verification systems enforce a strict hierarchical naming convention:
$$\text{CFBundleIdentifier}_{\text{extension}} = \text{CFBundleIdentifier}_{\text{main}} + \text{".<extension>"}$$

If the parent bundle ID is `net.metaquotes.MetaTrader5Terminal1` and the extension retained `net.metaquotes.MetaTrader5Terminal.Share`, iOS refuses to install the application, throwing:
```
MismatchedApplicationIdentifier: The CFBundleIdentifier of an app extension ('net.metaquotes.MetaTrader5Terminal.Share')
must be prefixed by the CFBundleIdentifier of the containing app ('net.metaquotes.MetaTrader5Terminal1').
```
Therefore, updating the extension's `CFBundleIdentifier` to `net.metaquotes.MetaTrader5Terminal1.Share` is strictly required for technical correctness and successful installation.

---

## 3. Analysis of Embedded Frameworks

The embedded dynamic frameworks located in `Payload/MetaTrader5Terminal.app/Frameworks/` were examined:

1. `ChatService.framework` (`net.metaquotes.ChatService`)
2. `ChatUI.framework` (`net.metaquotes.ChatUI`)
3. `CommonTools.framework` (`net.metaquotes.CommonTools`)
4. `UICollection.framework` (`net.metaquotes.UICollection`)

### Technical Decision: Preserve Framework Bundle Identifiers Intact
Under Apple's dynamic linker (`dyld`) and bundle specification:
- Dynamic frameworks are loaded by Mach-O rpath references (`@rpath/ChatService.framework/ChatService`).
- Framework bundle identifiers represent internal shared library interfaces and are **not** bound to the host application's `CFBundleIdentifier`.
- Modifying framework bundle identifiers would break dynamic symbol resolution and dyld bundle caches without providing any identity benefit.
- All four frameworks were preserved with their original bundle identifiers and binary code.

---

## 4. Binary Executable Inspection & Patching Decision

A comprehensive, byte-level investigation was conducted on the compiled binary executable `MetaTrader5Terminal` (8,113,312 bytes).

### 4.1 String Search Findings Across Binary Segments
The binary was scanned for occurrences of `net.metaquotes.MetaTrader5Terminal`:

| File Offset | Memory Segment | Content Context | Finding |
| :--- | :--- | :--- | :--- |
| `0x603A8D` | `__DATA.__const` | `sign_apple_personal.9PN8D6Q4E6.net.metaquotes.mql5` | MQL5 Community login group (different identifier) |
| `0x786F3C` | `LC_CODE_SIGNATURE` | SuperBlob CodeDirectory identifier | Signature metadata only |
| `0x799D5E` | `LC_CODE_SIGNATURE` | Embedded Entitlements XML | Signature metadata only |
| `0x799E76` | `LC_CODE_SIGNATURE` | Embedded Entitlements XML | Signature metadata only |
| `0x799F62` | `LC_CODE_SIGNATURE` | Embedded Entitlements XML | Signature metadata only |
| `0x79A0E5` | `LC_CODE_SIGNATURE` | Embedded Entitlements XML | Signature metadata only |
| `0x79A16A` | `LC_CODE_SIGNATURE` | Embedded Entitlements DER ASN.1 | Signature metadata only |
| `0x79A28C` | `LC_CODE_SIGNATURE` | Embedded Entitlements DER ASN.1 | Signature metadata only |
| `0x79A2DC` | `LC_CODE_SIGNATURE` | Embedded Entitlements DER ASN.1 | Signature metadata only |
| `0x79A37E` | `LC_CODE_SIGNATURE` | SuperBlob CodeDirectory identifier (SHA-256) | Signature metadata only |

### 4.2 Critical Engineering Conclusion: Do NOT Patch Binary Bytes
1. **No Hardcoded App Bundle ID in Code**: The executable code (`__TEXT.__text`) does **not** hardcode `net.metaquotes.MetaTrader5Terminal`. The application queries its identity dynamically via `[[NSBundle mainBundle] bundleIdentifier]` and `[[NSBundle mainBundle] infoDictionary]`.
2. **Binary Patching Risks**:
   - `net.metaquotes.MetaTrader5Terminal` is 34 ASCII bytes.
   - `net.metaquotes.MetaTrader5Terminal1` is 35 ASCII bytes.
   - Naively replacing strings in compiled Mach-O binaries alters segment byte lengths, destroying pointer offsets, jump tables, alignment boundaries, and virtual memory page mapping.
3. **Preservation of Executable**: In accordance with Requirement 2 ("Preserve the original executable and resources unless a change is explicitly necessary and technically supported" and "Do not blindly replace every occurrence of the original identifier inside binary files"), the executable Mach-O code was left 100% untouched.

---

## 5. Security & System Partitioning Impact

### 5.1 Keychain Isolation
- On iOS, an application's default keychain access group is scoped to its Application Identifier (`<AppIDPrefix>.<CFBundleIdentifier>`).
- By changing the Bundle ID to `net.metaquotes.MetaTrader5Terminal1`, the modified app receives a completely segregated keychain storage partition.
- **Benefit**: Existing broker credentials, active logins, and saved passwords in the original MetaTrader 5 installation will remain untouched, preventing any collision between the two applications.

### 5.2 Application Sandbox Isolation
- iOS sandboxes app containers under `/var/mobile/Containers/Data/Application/<UUID>/` keyed by the bundle identifier.
- The modified application will establish its own independent document directories, local cache, charts configuration, and history databases without conflicting with the official terminal.

### 5.3 App Groups & Shared Containers
- The app bundle contains the entitlement for `group.net.metaquotes.MetaTrader5Terminal.chat`.
- In enterprise or developer re-signing environments without access to the original Team ID (`4LK8F7J843`), the App Group entitlement must either be remapped to the new signing team's App Group (`group.<NewTeamID>.MetaTrader5Terminal.chat`) or omitted if chat sharing between the extension and terminal is not required.

### 5.4 Apple Push Notifications (`APNs`) & Apple Sign-In
- Push notifications (`aps-environment`) and Sign in with Apple are provisioned centrally by Apple's servers using the exact bundle ID and Team ID registered in the Apple Developer Portal.
- Sideloaded dual-install builds will not receive official MetaQuotes push notifications unless an APNs certificate is configured for `net.metaquotes.MetaTrader5Terminal1` under the re-signing developer account.
- Direct broker quotes, live trading, charts, order execution, and manual broker logins do **not** depend on APNs and operate independently over standard TCP socket connections.
