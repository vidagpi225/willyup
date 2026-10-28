// ============================================================
// CẤU HÌNH SUPABASE — BẮT BUỘC SỬA TRƯỚC KHI DEPLOY
// ============================================================
// 1. Tạo project miễn phí tại https://supabase.com
// 2. Vào Supabase Dashboard -> Project Settings -> API
// 3. Copy "Project URL" và "anon public" key, dán vào 2 chỗ dưới.
// 4. KHÔNG dán "service_role" key vào đây — key đó là key quản trị,
//    chỉ dùng ở máy chủ, tuyệt đối không đưa lên frontend public.
// 5. Chưa sửa 2 giá trị dưới thì trang sẽ chỉ hiện cảnh báo cấu hình,
//    không đăng nhập thật được (đây là hành vi cố tình, không phải lỗi).
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "https://supabase.com/dashboard/project/xxzmtlmhmsdczaeotmio/"
};
