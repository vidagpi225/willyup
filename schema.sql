-- ============================================================
-- schema.sql — chạy trong Supabase Dashboard -> SQL Editor -> New query
-- Chạy 1 lần cho project Supabase của bạn.
-- Lưu ý: bật RLS và chỉ cho mỗi user thấy/sửa dòng của chính mình
-- (user_id = auth.uid()). Quản trị project vẫn thấy toàn bộ bảng
-- trong Dashboard — xem cảnh báo trong README.md trước khi mở public.
-- ============================================================

-- Diary: 1 trang / ngày / user (unique user_id + entry_date)
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  title text default '',
  content text default '',
  font text default '''Be Vietnam Pro'',sans-serif',
  font_size int default 17,
  bold boolean default false,
  italic boolean default false,
  underline boolean default false,
  color text default '#23201a',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, entry_date)
);

-- Tasks: công việc theo ngày
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  time text,
  title text not null default '',
  note text default '',
  done boolean default false,
  created_at timestamptz default now()
);

-- Playlist: YouTube / Spotify
create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, -- 'youtube' | 'spotify'
  kind text,               -- youtube: 'video'; spotify: 'track'|'album'|'playlist'|'episode'|'show'
  ext_id text not null,    -- YouTube video id (11 ký tự) hoặc Spotify id
  url text not null,
  title text default '',
  created_at timestamptz default now()
);

-- Login sessions: phiên đăng nhập do app ghi khi đăng nhập thành công
create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null unique,
  device text,
  browser text,
  os text,
  timezone text, -- múi giờ trình duyệt báo về, KHÔNG phải vị trí IP chính xác
  login_at timestamptz default now(),
  last_activity timestamptz default now()
);

-- User settings: giao diện Sáng / Tối / Hệ thống
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text default 'system',
  created_at timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table public.diary_entries enable row level security;
alter table public.tasks enable row level security;
alter table public.playlist_items enable row level security;
alter table public.login_sessions enable row level security;
alter table public.user_settings enable row level security;

-- Xóa policy cũ nếu chạy lại file (tránh lỗi trùng tên)
drop policy if exists "own_diary" on public.diary_entries;
drop policy if exists "own_tasks" on public.tasks;
drop policy if exists "own_playlist" on public.playlist_items;
drop policy if exists "own_sessions" on public.login_sessions;
drop policy if exists "own_settings" on public.user_settings;

create policy "own_diary" on public.diary_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_playlist" on public.playlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_sessions" on public.login_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
