# CODE SIGNING & PROVISIONING REPORT

## 1. Executive Summary & Code Signing State

Every iOS application package (.ipa) distributed to physical iOS devices relies on Apple's hierarchical public-key infrastructure (PKI) and the Apple Mobile File Integrity (AMFI) kernel subsystem.

| Analysis Item | Status / Value |
| :--- | :--- |
| **Original Signer** | `Apple iPhone OS Application Signing` |
| **Certificate Issuer** | `Apple iPhone Certification Authority` |
| **Original Provisioning Profile** | **None** (Standard App Store FairPlay distribution) |
| **Original CodeDirectory Identifiers** | `net.metaquotes.MetaTrader5Terminal` |
| **Integrity State Post-Modification** | **Cryptographically Invalidated** (Expected result of modifying `Info.plist`) |
| **Local Signing Credentials Available** | **None** (No `.p12` certificates or `.mobileprovision` found on host system) |
| **Deployability on Stock iOS** | **Requires Re-Signing Before Installation** |

> [!WARNING]
> In accordance with Requirement 3 ("Never claim that an unsigned or incorrectly signed IPA is installable and operational"), this report explicitly confirms that the modified IPA package `MT5_Custom_BundleID1.ipa` **cannot** be installed directly onto an un-jailbroken stock iOS device without first being re-signed using valid Apple signing credentials or installed via a CoreTrust-bypassing environment such as TrollStore.

---

## 2. Cryptographic Proof of Signature Invalidation

When `CFBundleIdentifier` was modified in `Info.plist`, the cryptographic seal of the bundle was broken. The following concrete cryptographic measurements demonstrate this:

### 2.1 CodeDirectory Special Slot -1 Inspection
The Mach-O binary `MetaTrader5Terminal` contains an embedded code signature (`LC_CODE_SIGNATURE`) with dual CodeDirectories (SHA-1 and SHA-256). Special Slot -1 explicitly binds the binary to its `Info.plist`:

```
[CodeDirectory SHA-1 Header Analysis]
Magic               : 0xFADE0C02 (CSMAGIC_CODEDIRECTORY)
Version             : 0x20500
Special Slots Count : 7
Code Slots Count    : 1,927
Hash Type           : SHA-1 (20 bytes)
CodeDirectory Ident : net.metaquotes.MetaTrader5Terminal

[Special Slot -1: Info.plist Binding]
Original Recorded Hash : 372ff91af45109b9ac6b9a4f3c136853614b7257
Current Modified Hash  : c60c5bf1eee1ddfe9ef7ead4d9415ad2fffb661c
Status                 : MISMATCH (Signature Broken)
```

### 2.2 Bundle CodeResources Invalidation
The file `Payload/MetaTrader5Terminal.app/_CodeSignature/CodeResources` contains the signed cryptographic hashes of every static asset within the application. Because `Info.plist` and `PlugIns/Share.appex/Info.plist` were modified to establish the new identity, their checksums no longer match the signatures sealed by Apple's private key.

Because third parties do not possess Apple's root private key (`Apple iPhone OS Application Signing`), no external tool can generate a valid Apple App Store signature. A fresh signature must be generated using an Apple Developer signing identity.

---

## 3. Required Apple Signing Identity & Entitlements

To sign `MT5_Custom_BundleID1.ipa` for installation on target iOS devices, the following credentials and provisioning configurations are required:

### 3.1 Signing Identity
One of the following valid Apple Code Signing certificates with corresponding private key:
1. **Apple Development Certificate**: `Apple Development: Your Name (TeamID)` — For personal/development devices registered in the Apple Developer account.
2. **Apple Distribution Certificate (Ad Hoc)**: `Apple Distribution: Your Company (TeamID)` — For distribution to a registered device list (up to 100 devices per device class).
3. **Apple Enterprise Certificate**: `Apple Enterprise: Enterprise Name (TeamID)` — For in-house distribution without individual UDID registration.
4. **Free Personal Apple ID**: Generated dynamically by tools like AltStore or Sideloadly (valid for 7 days, up to 3 active sideloaded apps).

### 3.2 Provisioning Profiles (`embedded.mobileprovision`)
Two provisioning profiles (or one wildcard profile) are required:
1. **Main Application Profile**:
   - App ID: `<TeamID>.net.metaquotes.MetaTrader5Terminal1` (or `<TeamID>.*`)
   - Target Bundle ID: `net.metaquotes.MetaTrader5Terminal1`
2. **Share Extension Profile**:
   - App ID: `<TeamID>.net.metaquotes.MetaTrader5Terminal1.Share` (or `<TeamID>.*`)
   - Target Bundle ID: `net.metaquotes.MetaTrader5Terminal1.Share`

### 3.3 Adapted Entitlements Configuration
When re-signing under a new Apple Developer Team, the entitlements must be updated to reference the new Team ID:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>application-identifier</key>
	<string><NEW_TEAM_ID>.net.metaquotes.MetaTrader5Terminal1</string>
	<key>com.apple.developer.team-identifier</key>
	<string><NEW_TEAM_ID></string>
	<key>keychain-access-groups</key>
	<array>
		<string><NEW_TEAM_ID>.net.metaquotes.MetaTrader5Terminal1</string>
	</array>
</dict>
</plist>
```

---

## 4. Limitation Report

A full scan of the local development environment (`c:\Users\Hoang\Desktop\Anti_test_test` and user profile directories) was executed:
- **`*.p12` Private Keys / Certificates**: 0 found.
- **`*.mobileprovision` Provisioning Profiles**: 0 found.
- **macOS `codesign` utility**: Unavailable (Host environment is Windows 11 x64).

### Conclusion:
Suitable signing credentials are **unavailable** in the current environment. Consequently:
- `MT5_Custom_BundleID1.ipa` has been packaged with valid bundle structures, correct plist dictionaries, decrypted binaries, and complete assets.
- However, it currently contains an invalidated App Store signature stub.
- **It cannot be installed onto a production iOS device without re-signing.**

---

## 5. Step-by-Step Instructions to Sign & Install

To install `MT5_Custom_BundleID1.ipa` onto an iOS device, use one of the following validated workflows:

### Method 1: Sideloadly (Windows / macOS) — Recommended
1. Download and launch **Sideloadly** (`sideloadly.io`).
2. Connect your iOS device via USB.
3. Drag and drop `MT5_Custom_BundleID1.ipa` into Sideloadly.
4. Enter your Apple ID email.
5. In **Advanced Options**:
   - Ensure Bundle ID is set to `net.metaquotes.MetaTrader5Terminal1` (or left as Default).
   - Check **Re-encrypt & Sign**.
6. Click **Start**. Sideloadly will automatically register the App ID, generate a development provisioning profile, sign all binaries and frameworks, and install the application directly onto your iOS device.

### Method 2: AltStore / AltServer (Windows / macOS)
1. Install **AltServer** on your computer and install **AltStore** on your iOS device.
2. Transfer `MT5_Custom_BundleID1.ipa` to your iOS device (via AirDrop, iCloud Drive, or local storage).
3. Open AltStore, navigate to **My Apps**, tap **+**, and select `MT5_Custom_BundleID1.ipa`.
4. AltStore will sign and install the app alongside your existing MT5 terminal.

### Method 3: TrollStore (Jailbroken / CoreTrust Vulnerable Devices)
1. For devices running iOS 14.0–15.4.1 or 15.5b1–16.6.1 supported by TrollStore:
2. Open `MT5_Custom_BundleID1.ipa` in TrollStore.
3. TrollStore installs the app directly using root privileges and its CoreTrust faux-signature, bypassing AMFI signature requirements and providing permanent installation without 7-day expiration.

### Method 4: macOS Command Line (`codesign` & Developer Certificate)
If executing on a macOS workstation with an active Apple Developer Certificate:
```bash
# 1. Unzip the package
unzip MT5_Custom_BundleID1.ipa -d Staging

# 2. Re-sign embedded frameworks
for fw in Staging/Payload/MetaTrader5Terminal.app/Frameworks/*.framework; do
    codesign --force --sign "Apple Development: Your Name (XXXXXXXXXX)" "$fw"
done

# 3. Re-sign Share extension
codesign --force --sign "Apple Development: Your Name (XXXXXXXXXX)" \
    --entitlements share_entitlements.plist \
    Staging/Payload/MetaTrader5Terminal.app/PlugIns/Share.appex

# 4. Re-sign main application
codesign --force --sign "Apple Development: Your Name (XXXXXXXXXX)" \
    --entitlements app_entitlements.plist \
    Staging/Payload/MetaTrader5Terminal.app

# 5. Repackage into signed IPA
cd Staging && zip -qry ../MT5_Signed_BundleID1.ipa Payload
```
