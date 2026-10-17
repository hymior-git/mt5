# MetaTrader 5 iOS — Custom Bundle Identifier (`net.metaquotes.MetaTrader5Terminal1`)

Dự án nghiên cứu dịch ngược, điều chỉnh Bundle Identifier và phân tích khả thi tích hợp Demo Broker tùy chỉnh cho ứng dụng MetaTrader 5 (MT5) trên hệ điều hành iOS.

---

## 1. Thông Tin Gói Ứng Dụng (Artifacts)

| Thuộc tính | Giá trị |
| :--- | :--- |
| **Tên Gói IPA Đã Sửa** | `MT5_Custom_BundleID1.ipa` |
| **Kích Thước** | `22,881,624 bytes` (~22.8 MB) |
| **Mã Băm SHA-256** | `839CBF79C70D7A7215C847E009352D63F084DAF5EE50446E44E547B66E288F53` |
| **Bundle Identifier Mới (Chính)** | `net.metaquotes.MetaTrader5Terminal1` (kết thúc bằng chữ số `1`) |
| **URL Scheme Name** | `net.metaquotes.MetaTrader5Terminal1` |
| **Extension Bundle ID** | `net.metaquotes.MetaTrader5Terminal1.Share` (phù hợp quy tắc phân cấp iOS) |
| **Kiến Trúc Binary** | `arm64` (Mach-O 64-bit, `cryptid = 0` - Decrypted) |
| **Phiên Bản MT5 / Build** | Version `5.0.6230`, Build `5242` |
| **Yêu Cầu iOS Tối Thiểu** | iOS 15.0+ |

---

## 2. Báo Cáo Kỹ Thuật Chi Tiết (Documentation)

Dự án bao gồm 5 tài liệu phân tích kỹ thuật chuyên sâu theo tiêu chuẩn Senior Mobile Reverse Engineering:

1. **[IPA_ANALYSIS.md](file:///c:/Users/Hoang/Desktop/Anti_test_test/IPA_ANALYSIS.md)**:
   - Phân tích cấu trúc file IPA, Mach-O binary headers, DRM FairPlay (`LC_ENCRYPTION_INFO_64`).
   - Danh mục và cấu hình 4 dynamic frameworks nhúng (`ChatService`, `ChatUI`, `CommonTools`, `UICollection`).
   - Danh mục Entitlements, Keychain Access Groups, App Groups và Capabilities.

2. **[BUNDLE_ID_CHANGES.md](file:///c:/Users/Hoang/Desktop/Anti_test_test/BUNDLE_ID_CHANGES.md)**:
   - Chi tiết các thay đổi cấu hình `Info.plist` của Main App và `Share.appex`.
   - Báo cáo quét mã nhị phân: Xác nhận chuỗi Bundle ID không bị hardcode trong code section (`__TEXT.__text`), bảo toàn toàn vẹn binary gốc và không can thiệp byte nhị phân để tránh hỏng offset hay memory alignment.
   - Cơ chế cô lập Sandbox và Keychain giúp cài đặt song song 2 ứng dụng MT5 (Dual Apps) trên cùng một thiết bị iOS.

3. **[SIGNING_REPORT.md](file:///c:/Users/Hoang/Desktop/Anti_test_test/SIGNING_REPORT.md)**:
   - Đánh giá trạng thái chữ ký gốc (Apple App Store distribution signature).
   - Chứng minh toán học sự vô hiệu hóa chữ ký do sửa đổi `Info.plist` (CodeDirectory Special Slot -1 mismatch).
   - Hướng dẫn ký lại (Re-signing) và cài đặt thông qua **Sideloadly**, **AltStore**, hoặc **TrollStore**.

4. **[FUNCTIONAL_TEST_RESULTS.md](file:///c:/Users/Hoang/Desktop/Anti_test_test/FUNCTIONAL_TEST_RESULTS.md)**:
   - Bảng ma trận kiểm thử 10 hạng mục bắt buộc, phân biệt rõ ràng giữa **PASSED**, **FAILED**, và **NOT TESTED** kèm bằng chứng kỹ thuật.

5. **[BROKER_INTEGRATION_FEASIBILITY.md](file:///c:/Users/Hoang/Desktop/Anti_test_test/BROKER_INTEGRATION_FEASIBILITY.md)**:
   - Phân tích kiến trúc mạng và giao thức truyền thông độc quyền nhị phân của MetaQuotes (MTP qua cổng TCP 443/1980).
   - Đánh giá khả thi kết nối Demo Broker độc lập (`MHT Demo Broker` / Server `MHT-Demo-01`).
   - Giải thích lý do máy chủ web thông thường (REST/WebSocket) không thể giao tiếp trực tiếp với client MT5 iOS và lộ trình triển khai hạ tầng MT5 Server chính thức.

---

## 3. Hướng Dẫn Cài Đặt Lên Thiết Bị iOS

Do chữ ký App Store ban đầu bị vô hiệu hóa sau khi đổi Bundle ID, ứng dụng cần được ký lại bằng Apple ID cá nhân/nhà phát triển hoặc cài qua TrollStore:

### Cách 1: Cài đặt qua Sideloadly (Khuyên dùng trên Windows / Mac)
1. Cài đặt và mở **Sideloadly** (`sideloadly.io`).
2. Kết nối iPhone/iPad qua cáp USB.
3. Kéo thả file `MT5_Custom_BundleID1.ipa` vào Sideloadly.
4. Nhập tài khoản Apple ID để cấp chứng chỉ tạm thời (7 ngày).
5. Nhấn **Start** để hoàn tất ký và cài đặt trực tiếp lên thiết bị.

### Cách 2: Cài đặt qua TrollStore (Thiết bị hỗ trợ CoreTrust)
1. Chuyển file `MT5_Custom_BundleID1.ipa` sang thiết bị iOS (qua AirDrop / iCloud Drive).
2. Chọn mở bằng ứng dụng **TrollStore**.
3. Ứng dụng sẽ được cài đặt vĩnh viễn không cần ký lại mỗi 7 ngày.
