# HƯỚNG DẪN XUẤT FILE .IPA & CÀI ĐẶT METATRADER 5 LÊN IPHONE

Hệ thống đã tạo sẵn file cài đặt iOS chuẩn MetaTrader 5 cùng toàn bộ mã nguồn native và kịch bản build tự động:

- **File IPA sẵn sàng**: [`MetaTrader5_LocalDemo.ipa`](file:///c:/Users/Hoang/Desktop/Anti_test_test/MetaTrader5_LocalDemo.ipa) (Dung lượng: ~22.8 MB)
- **Kịch bản đóng gói nhanh trên Windows**: [`build_ipa_local.ps1`](file:///c:/Users/Hoang/Desktop/Anti_test_test/build_ipa_local.ps1)
- **Mã nguồn iOS Xcode Native**: thư mục `ios_native_project/` và cấu hình `project.yml`
- **Kịch bản Cloud CI/CD tự động**: `.github/workflows/build-ipa.yml`

---

## CÁCH 1: Cài đặt file .IPA trực tiếp lên iPhone bằng máy tính (Khuyên dùng)

> [!TIP]
> Bạn có thể cài file `MetaTrader5_LocalDemo.ipa` trực tiếp vào iPhone mà không cần tài khoản Apple Developer trả phí:

1. Tải phần mềm miễn phí **Sideloadly** trên máy tính: [https://sideloadly.io](https://sideloadly.io)
2. Kết nối iPhone với máy tính qua dây cáp USB (chọn **Tin cậy máy tính này** trên iPhone).
3. Mở Sideloadly, kéo thả file `MetaTrader5_LocalDemo.ipa` vào ô IPA.
4. Nhập Apple ID của bạn vào ô Apple ID và bấm nút **Start**.
5. Sau 1 phút, biểu tượng **MetaTrader 5** sẽ xuất hiện trên màn hình chính iPhone.
6. Trên iPhone, vào **Cài đặt (Settings) → Cài đặt chung (General) → Quản lý VPN & Thiết bị**, chọn Apple ID của bạn và bấm **Tin cậy (Trust)** để mở app.

---

## CÁCH 2: Tải trực tiếp file IPA từ trình duyệt web

Khi mở ứng dụng tại `http://localhost:8080/`, bạn có thể bấm vào nút màu xanh lá cây **"📥 Xuất file .IPA"** ở góc trên bên phải màn hình hoặc vào tab **Cài đặt (Settings) → Xuất file cài đặt iOS (.IPA)** để tải ngay file `MetaTrader5_LocalDemo.ipa`.

---

## CÁCH 3: Tự động Build file .IPA mới qua GitHub Actions (Cloud macOS)

1. Đẩy (push) toàn bộ thư mục này lên GitHub repository của bạn.
2. GitHub Actions sẽ tự động kích hoạt workflow `.github/workflows/build-ipa.yml`.
3. Máy chủ macOS 14 của GitHub sẽ tự động cài đặt XcodeGen, biên dịch Release build và đóng gói thành file `MetaTrader5-LocalDemo-IPA.zip` trong mục **Artifacts** để bạn tải về.

---

## CÁCH 4: Cài đặt dạng PWA (Không cần máy tính, không cần file IPA)

1. Đưa trang web lên Vercel, Netlify hoặc mở Safari trên iPhone kết nối cùng mạng WiFi với máy tính (`http://[IP_MÁY_TÍNH]:8080`).
2. Mở trình duyệt **Safari** trên iPhone.
3. Bấm vào nút **Chia sẻ** (biểu tượng hình vuông có mũi tên trỏ lên `⬆️`).
4. Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
5. Lúc này ứng dụng sẽ có icon MetaTrader 5 ngoài màn hình chính iPhone và chạy toàn màn hình y hệt app gốc 100%!
