# SEO khi đưa website lên hosting

Mã nguồn đang dùng tên miền `https://noithatminhtu.com/` có sẵn trong cấu hình ban đầu. Cần xác nhận đây là tên miền chính thức trước khi phát hành; nếu đổi tên miền, cập nhật đồng bộ canonical, Open Graph, Twitter, JSON-LD, `robots.txt` và `sitemap.xml`.

- Đưa `index.html`, `assets/`, `robots.txt` và `sitemap.xml` lên thư mục gốc công khai. Không đưa thư mục `.git`, tệp kiểm tra và tài liệu nội bộ lên hosting.
- Cấu hình HTTPS; chuyển hướng vĩnh viễn HTTP, tên miền phụ `www` và `/index.html` về URL chính thức để tránh nhiều bản sao cùng nội dung. Chỉ cấu hình chuyển hướng ở hosting phù hợp, không dùng JavaScript thay thế.
- Kiểm tra trang chủ trả HTTP 200, URL không tồn tại trả 404, và hosting không chèn `noindex` hoặc `X-Robots-Tag: noindex` lên bản chính thức.
- Bật Brotli hoặc gzip, HTTP/2 hoặc HTTP/3 nếu hosting hỗ trợ. Đặt bộ nhớ đệm cho ảnh/font; vẫn cho phép HTML và các tệp SEO được cập nhật nhanh.
- Xác minh quyền sở hữu Google Search Console, gửi `https://noithatminhtu.com/sitemap.xml`, kiểm tra URL trang chủ và theo dõi lập chỉ mục, Core Web Vitals trên dữ liệu thực tế.
- Kiểm tra JSON-LD bằng Google Rich Results Test sau khi phát hành. Dữ liệu hiện chỉ dùng thông tin đã có trên trang; chỉ thêm giờ mở cửa, tọa độ, giá hoặc đánh giá khi có dữ liệu thật đã xác nhận.
- Bổ sung ảnh công trình thật, mô tả hạng mục đã làm và nội dung dịch vụ riêng khi có tư liệu. Trang hiện còn các khung ảnh chờ cập nhật; không dùng ảnh hoặc dự án giả để lấp chỗ trống.
- Duy trì tên doanh nghiệp, địa chỉ và số điện thoại nhất quán với Google Business Profile. Thay liên kết chia sẻ Facebook bằng URL trang doanh nghiệp cố định khi có.

Sitemap hiện chứa duy nhất trang chủ vì website chỉ có một trang. Các liên kết `#...` trong trang không phải các trang độc lập và không được thêm thành URL riêng trong sitemap. Không khai báo `lastmod` khi không có ngày cập nhật nội dung đáng tin cậy.

Thay đổi trong mã nguồn không tự gửi trang cho Google hoặc bảo đảm thứ hạng. Lập chỉ mục và kết quả tìm kiếm còn phụ thuộc bản triển khai công khai, nội dung thực tế và quá trình thu thập của công cụ tìm kiếm.

Tài liệu tham khảo: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Local Business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Site names](https://developers.google.com/search/docs/appearance/site-names).
