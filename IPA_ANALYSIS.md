# IPA ANALYSIS REPORT: MetaTrader 5 iOS Terminal

## 1. Executive Summary

| Property | Value |
| :--- | :--- |
| **Source Archive** | `mt5.zip` |
| **Extracted Package** | `net.metaquotes.MetaTrader5Terminal_5.0.6230_und3fined.ipa` |
| **Package SHA-256** | `94354A230B286C2EA7433A2183F024FE256D672516876585A935BDFE10CC55A3` |
| **App Bundle Name** | `MetaTrader5Terminal.app` |
| **App Display Name** | `MetaTrader 5` |
| **Original Bundle Identifier** | `net.metaquotes.MetaTrader5Terminal` |
| **App Version / Build** | Version `5.0.6230`, Build `5242` |
| **Minimum iOS Version** | `iOS 15.0` |
| **Target SDK** | `iphoneos26.5` (Build `23F81a`) |
| **Xcode Version** | `17F113` (Xcode 16.0 / 2660) |
| **Target Architectures** | `arm64` (Mach-O 64-bit) |
| **Decryption State** | **Fully Decrypted** (`cryptid = 0`) |
| **Origin / Source State** | App Store dump via `decrypted.day` (verified by `Payload/decrypt.day`) |

---

## 2. Mach-O Binary Architecture & DRM Status

The main executable `Payload/MetaTrader5Terminal.app/MetaTrader5Terminal` was inspected at the binary header level.

### 2.1 Mach-O Header Structure
- **Magic Number**: `0xFEEDFACF` (`MH_MAGIC_64` - 64-bit Mach-O binary)
- **CPU Type**: `CPU_TYPE_ARM64` (`0x0100000C`)
- **CPU Subtype**: `CPU_SUBTYPE_ARM64_ALL` (`0x00000000`)
- **File Type**: `MH_EXECUTE` (`0x00000002`)
- **Load Commands Count (`ncmds`)**: 75
- **Size of Load Commands (`sizeofcmds`)**: 9,048 bytes
- **Flags**: `MH_PIE | MH_TWOLEVEL | MH_DYLDLINK | MH_NOUNDEFS`

### 2.2 FairPlay Encryption Analysis (`LC_ENCRYPTION_INFO_64`)
iOS App Store applications are originally distributed encrypted with Apple FairPlay DRM. A Mach-O binary contains the `LC_ENCRYPTION_INFO_64` load command (command ID `0x2C` = 44) specifying the offset and size of the encrypted code segment:

```
[Mach-O Load Command 0x2C - LC_ENCRYPTION_INFO_64]
cryptoff  : 16384 (0x00004000)
cryptsize : 6848512 (0x00688000)
cryptid   : 0
```

- **Analysis**: Because `cryptid = 0`, the executable code has been completely decrypted and dumped from memory. The original binary code sections (`__TEXT.__text`, `__TEXT.__stubs`, etc.) are in plaintext and directly readable by dyld without requiring FairPlay decryption keys from Apple's Secure Enclave.
- **Verification of Plugin Binary**: The embedded extension binary `Payload/MetaTrader5Terminal.app/PlugIns/Share.appex/Share` was also verified:
  ```
  [Share Mach-O Load Command 0x2C - LC_ENCRYPTION_INFO_64]
  cryptoff  : 16384 (0x00004000)
  cryptsize : 49152 (0x0000C000)
  cryptid   : 0
  ```
  Both main application and extension binaries are completely decrypted.

---

## 3. Package Structure & Bundle Contents

The IPA contains 407 extracted files organized into the standard iOS application hierarchy:

```
Payload/
├── decrypt.day                                 [Origin marker from decrypted.day]
└── MetaTrader5Terminal.app/
    ├── MetaTrader5Terminal                     [Main arm64 executable: 8,113,312 bytes]
    ├── Info.plist                              [Main app configuration dictionary]
    ├── PkgInfo                                 [Package type 'APPL????']
    ├── PrivacyInfo.xcprivacy                   [Apple Privacy Manifest: 947 bytes]
    ├── Assets.car                              [Compiled Asset Catalog: 18,630,680 bytes]
    ├── default.metallib                        [Compiled Metal GPU shader library: 12,270 bytes]
    ├── alert.wav, ok.wav, err.wav, push.caf    [Platform audio cues & notifications]
    ├── *.nib (15 files)                        [Compiled Interface Builder UI layouts]
    ├── Launch.storyboardc/                     [Launch screen storyboard]
    ├── <lang>.lproj/ (23 localizations)        [ar, cs, de, el, en, es, fa, fr, he, hi, id, it, ja, ko, ms, nl, pl, pt, ru, th, tr, uk, vi, zh]
    ├── Frameworks/                             [Dynamic frameworks]
    │   ├── ChatService.framework/              [MQL5 Community chat backend & networking]
    │   ├── ChatUI.framework/                   [MQL5 Community chat UI components]
    │   ├── CommonTools.framework/              [Cryptographic and utility primitives]
    │   └── UICollection.framework/             [Custom UI controls & charting helpers]
    ├── PlugIns/
    │   └── Share.appex/                        [iOS Share Sheet Extension]
    │       ├── Share                           [arm64 extension binary: 133,424 bytes]
    │       ├── Info.plist                      [Extension property list]
    │       ├── MainInterface.storyboardc/      [Extension view controller]
    │       ├── Assets.car                      [Extension assets]
    │       └── <lang>.lproj/ (23 localizations)
    ├── SC_Info/                                [FairPlay DRM manifests & sinf files]
    └── _CodeSignature/
        └── CodeResources                       [Cryptographic seal of bundle resources]
```

---

## 4. Embedded Frameworks Analysis

All embedded dynamic frameworks within `MetaTrader5Terminal.app/Frameworks/` were inspected:

| Framework | Executable | Bundle Identifier | Embedded Info.plist Format | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **ChatService.framework** | `ChatService` (439,200 bytes) | `net.metaquotes.ChatService` | Binary Plist (`bplist00`) | Core MQL5 chat communication service |
| **ChatUI.framework** | `ChatUI` (348,384 bytes) | `net.metaquotes.ChatUI` | Binary Plist (`bplist00`) | UI components for trader chat |
| **CommonTools.framework** | `CommonTools` (225,824 bytes) | `net.metaquotes.CommonTools` | Binary Plist (`bplist00`) | Common mathematical and algorithmic tools |
| **UICollection.framework** | `UICollection` (381,968 bytes) | `net.metaquotes.UICollection` | Binary Plist (`bplist00`) | Reusable UI controls and tables |

Under iOS bundle architecture, embedded frameworks have their own isolated bundle namespaces (`CFBundlePackageType = FMWK`) and are dynamically linked via `@rpath`. They do **not** take the host application's Bundle ID.

---

## 5. App Extensions (`PlugIns/`)

The application contains one application extension:
- **Path**: `Payload/MetaTrader5Terminal.app/PlugIns/Share.appex`
- **Extension Point**: `com.apple.share-services` (iOS Share Sheet)
- **Original CFBundleIdentifier**: `net.metaquotes.MetaTrader5Terminal.Share`
- **Main Storyboard**: `MainInterface`
- **iOS Extension Rule**: Apple's operating system strictly enforces that an app extension's bundle identifier MUST begin with the containing application's bundle identifier as its prefix:
  $$\text{BundleID}_{\text{Extension}} = \text{BundleID}_{\text{App}} + \text{".<ExtensionName>"}$$
  Leaving the extension bundle ID unchanged while changing the main app bundle ID will cause iOS `installd` to reject the application with an `ApplicationIdentifierMismatch` error during installation.

---

## 6. Entitlements & Security Capabilities

The original code signature's embedded SuperBlob (`LC_CODE_SIGNATURE` at offset `7892640`) was parsed. The embedded XML entitlements dictionary contains:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>keychain-access-groups</key>
	<array>
		<string>9PN8D6Q4E6.net.metaquotes.MetaTrader5Terminal</string>
		<string>9PN8D6Q4E6.net.metaquotes.mql5</string>
	</array>
	<key>com.apple.developer.team-identifier</key>
	<string>4LK8F7J843</string>
	<key>application-identifier</key>
	<string>9PN8D6Q4E6.net.metaquotes.MetaTrader5Terminal</string>
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>
	<key>aps-environment</key>
	<string>production</string>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>webcredentials:metatrader5.name</string>
	</array>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.net.metaquotes.MetaTrader5Terminal.chat</string>
	</array>
</dict>
</plist>
```

### Key Security Discoveries:
1. **Team Identifier**: `4LK8F7J843` (MetaQuotes Software Corp.).
2. **App ID Prefix / Seed**: `9PN8D6Q4E6`.
3. **Keychain Access Groups**:
   - `9PN8D6Q4E6.net.metaquotes.MetaTrader5Terminal`: Primary credential vault for trade accounts, saved passwords, certificates, and terminal settings.
   - `9PN8D6Q4E6.net.metaquotes.mql5`: Shared single sign-on credential vault for MQL5.community services.
4. **App Groups**:
   - `group.net.metaquotes.MetaTrader5Terminal.chat`: Shared container used by `MetaTrader5Terminal.app`, `ChatService.framework`, and `Share.appex` to exchange images, messages, and state.
5. **Apple Sign-In**:
   - Configured with `Default` entitlement for MQL5 community authentication.
6. **Associated Domains**:
   - `webcredentials:metatrader5.name`: Enables Shared Web Credentials for autofilling MQL5 logins.

---

## 7. URL Schemes & Deep Linking

From `MetaTrader5Terminal.app/Info.plist`:
- **CFBundleURLTypes**:
  - `CFBundleURLName`: `net.metaquotes.MetaTrader5Terminal`
  - `CFBundleURLSchemes`: `metatrader5`
- **Queried Schemes (`LSApplicationQueriesSchemes`)**:
  - `tradays`: Used to query and launch MetaQuotes Tradays Economic Calendar app.

---

## 8. Summary of Findings

1. The provided IPA is an arm64 binary dumped with `cryptid = 0` (decrypted).
2. The package structure is fully intact, containing all necessary frameworks, assets, and UI resources.
3. The application is completely functional in its resource layout, but changing its identity requires synchronized updates across `MetaTrader5Terminal.app/Info.plist` and `PlugIns/Share.appex/Info.plist`.
4. The executable binary itself does not hardcode `net.metaquotes.MetaTrader5Terminal` in its code sections, meaning executable code modifications are neither necessary nor technically advisable.
