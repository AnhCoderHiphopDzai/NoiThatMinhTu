# Sửa nhận báo giá qua Google Sheets và Telegram

## Đã xác định

- Lỗi `Cannot read properties of undefined (reading 'parameter')` xuất hiện khi chạy `doPost` trực tiếp bằng nút Run, không có sự kiện HTTP `e`. Hãy chạy `diagnoseConfiguration` để kiểm tra cấu hình; chỉ website mới gọi `doPost` khi gửi form.
- Kiểm tra GET không đăng nhập tới URL `/exec` đang dùng ngày 09/11/2026 bị chuyển tới `accounts.google.com`. Khách truy cập ẩn danh chưa dùng được endpoint hiện tại. Cần kiểm tra quyền truy cập và phiên bản triển khai.
- Bản website cũ dùng `no-cors`: không đọc được phản hồi và vẫn xóa form sau khi request kết thúc. Bản mới chỉ báo thành công và xóa form sau khi máy chủ xác nhận đã lưu.

## Cập nhật Apps Script

1. Mở [bảng nhận báo giá](https://docs.google.com/spreadsheets/d/1ZetMEUw-BuhdyDCXkGENOJx3_51gj71SzssklJG-Q_s/edit#gid=0), vào **Tiện ích mở rộng / Extensions → Apps Script**. Dùng đúng dự án đang sở hữu URL `/exec` trong thuộc tính `action` của form ở `index.html`.
2. Thay mã nhận báo giá cũ bằng toàn bộ nội dung `Code.gs` trong thư mục này. Chỉ giữ một hàm `doPost` và một hàm `doGet` trong dự án; không xóa các hàm khác không liên quan.
3. Vào **Project Settings / Cài đặt dự án → Script properties / Thuộc tính tập lệnh**, thêm:

   | Thuộc tính | Giá trị |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | Token bot mới, nhập trực tiếp tại Google; không đưa vào HTML, Git hoặc gửi lại trong chat. |

   ID bảng, tab `gid=0` và chat ID đã được điền trong `QUOTE_CONFIG` theo thông tin bạn cung cấp. Nếu token mới thuộc một bot khác, hãy mở đúng bot đó và nhấn **Start** bằng tài khoản Telegram nhận báo giá. Thu hồi token đã chia sẻ qua BotFather trước khi dùng token thay thế.
4. Trong danh sách hàm bên cạnh nút Run, chọn **`diagnoseConfiguration`**, chạy và cấp các quyền Google yêu cầu cho chính dự án này. Hàm chỉ kiểm tra quyền đọc bảng, token và cuộc trò chuyện; không thêm dòng hay gửi tin nhắn. Kết quả mong đợi trong nhật ký: `SHEETS_OK` và `TELEGRAM_OK`. Đừng bấm Run trực tiếp `doPost`.
5. Vào **Deploy / Triển khai → Manage deployments / Quản lý triển khai → Edit / Chỉnh sửa**, chọn **New version / Phiên bản mới**. Với Web App nhận biểu mẫu từ khách ẩn danh:

   - **Execute as / Thực thi dưới danh nghĩa:** tài khoản của bạn, có quyền chỉnh sửa bảng.
   - **Who has access / Ai có quyền truy cập:** **Anyone / Bất kỳ ai**, gồm người chưa đăng nhập; không phải chỉ người có tài khoản Google.
   - Triển khai phiên bản mới. Sửa deployment hiện có để giữ URL `/exec`. Nếu tạo deployment mới, thay URL `action` của `#quote-form` trong `index.html` bằng URL `/exec` mới, không dùng `/dev`.

   Đây là quyền truy cập Web App nhận yêu cầu công khai, không yêu cầu chia sẻ công khai bảng dữ liệu. Nếu tài khoản Workspace không có tùy chọn khách ẩn danh, cần quản trị viên cho phép hoặc dùng backend phù hợp; không thể sửa hạn chế đó bằng JavaScript trên website.
6. Mở URL `/exec` trong cửa sổ ẩn danh. Phải thấy JSON có `service: "minh-tu-quotes"`, `version: "2026-11-09"`, không bị yêu cầu đăng nhập. Phép kiểm tra này chỉ xác nhận deployment công khai và đúng mã, không thay thế bước kiểm tra Sheets/Telegram.
7. Đưa `index.html` và `assets/quote-form.js` mới lên hosting cùng các assets đang có. Thư mục `apps-script/` và `tests/` là mã vận hành/kiểm thử, không cần đưa lên hosting công khai. Tải lại website, tự gửi một yêu cầu thử có nội dung rõ ràng `KIỂM TRA`, rồi kiểm tra dòng mới trong Sheets và tin nhắn Telegram.

## Dữ liệu lưu trong tab gid=0

| Cột | Nội dung |
| --- | --- |
| A–D | Thời gian, họ tên, số điện thoại, lời nhắn — giữ thứ tự của mã cũ |
| E | Email |
| F | Loại công trình |
| G | Mã yêu cầu để nhận diện lần gửi lại |
| H | Trạng thái Telegram |

Mã chỉ tạo hàng tiêu đề khi tab hoàn toàn trống. Nếu bảng đã có tiêu đề A–D, tự bổ sung tiêu đề E–H như trên. Không thay thứ tự hoặc dùng cột G/H cho dữ liệu khác. Mã không chỉnh sửa các dòng báo giá cũ; số điện thoại và nội dung được ghi dạng văn bản để giữ số 0 đầu và không chạy công thức từ dữ liệu nhập.

Nếu Telegram lỗi, dữ liệu vẫn được giữ trong Sheets; xem cột H và **Executions / Lượt thực thi**. HTTP 401 thường là token không hợp lệ; 400 cần kiểm tra chat ID/Start bot; 403 thường là bot bị chặn hoặc thiếu quyền. Gửi lại cùng một yêu cầu từ form khi mất phản hồi không tạo dòng hoặc thông báo thứ hai. Nếu đã lưu nhưng Telegram chưa gửi được, sửa cấu hình và xử lý thông báo còn thiếu dựa trên cột H; bản này không tự gửi lại Telegram để tránh thông báo trùng.

## Giới hạn kiểm tra

Mã được kiểm thử cục bộ với Sheets và Telegram giả lập. Chưa có quyền Google để thay cấu hình deployment hoặc kiểm tra gửi thật. `no-cors` đã được bỏ; nếu request bị lỗi mạng, CORS hoặc hết thời gian, website giữ thông tin và báo chưa xác nhận, không khẳng định rằng yêu cầu chưa từng được lưu. Không dùng proxy CORS công cộng cho dữ liệu liên hệ khách hàng.

Tài liệu: [Google Web Apps](https://developers.google.com/apps-script/guides/web), [giới hạn các hàm getActive khi chạy Web App](https://developers.google.com/apps-script/guides/bound#special_methods), [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage).
