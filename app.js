/* Nhật ký / Lịch tuần / Thống kê / Nhạc — frontend tĩnh + Supabase.
   Dữ liệu lưu trong project Supabase của người deploy, KHÔNG lưu trong Muse.
   Quản trị project Supabase đó có thể thấy các dòng dữ liệu trong database
   (xem README.md) — hãy cân nhắc trách nhiệm bảo mật khi mở public. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cfg = (window.APP_CONFIG || {});
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 &&
    cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf('YOUR-ANON-KEY') === -1;
  var supabase = null;
  if (configured && window.supabase) {
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  // ---------- Theme: Sáng / Tối / Hệ thống (mặc định Hệ thống) ----------
  var themePref = localStorage.getItem('nk_theme') || 'system';
  function applyTheme() {
    var dark = false;
    if (themePref === 'dark') dark = true;
    else if (themePref === 'light') dark = false;
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme-btn') === themePref);
    });
  }
  document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      themePref = b.getAttribute('data-theme-btn');
      try { localStorage.setItem('nk_theme', themePref); } catch (e) {}
      applyTheme();
      if (state.user && supabase) {
        supabase.from('user_settings').upsert({ user_id: state.user.id, theme: themePref }).then(function () {});
      }
    });
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (themePref === 'system') applyTheme();
    });
  }
  applyTheme();

  // ---------- State ----------
  var state = {
    user: null, mode: 'login', diary: [], tasks: [], playlist: [], sessions: [],
    weekOffset: 0, trackIndex: -1, editingTaskId: null,
    diaryBold: false, diaryItalic: false, diaryUnderline: false
  };
  function localDateStr(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function parseDate(s) { var p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function mondayOf(d) { var x = new Date(d); var dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
  function getSessionId() {
    var id = null;
    try { id = localStorage.getItem('nk_session_id'); if (!id) { id = uuid(); localStorage.setItem('nk_session_id', id); } } catch (e) { id = uuid(); }
    return id;
  }
  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var browser = 'Trình duyệt khác';
    if (ua.indexOf('Edg') !== -1) browser = 'Edge';
    else if (ua.indexOf('Chrome') !== -1) browser = 'Chrome';
    else if (ua.indexOf('Firefox') !== -1) browser = 'Firefox';
    else if (ua.indexOf('Safari') !== -1) browser = 'Safari';
    var os = 'Hệ điều hành khác';
    if (ua.indexOf('Android') !== -1) os = 'Android';
    else if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) os = 'iOS';
    else if (ua.indexOf('Windows') !== -1) os = 'Windows';
    else if (ua.indexOf('Mac') !== -1) os = 'macOS';
    else if (ua.indexOf('Linux') !== -1) os = 'Linux';
    var tz = 'Không rõ';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
    return { device: ua.indexOf('Mobile') !== -1 ? 'Điện thoại' : 'Máy tính', browser: browser, os: os, timezone: tz };
  }

  // ---------- Views ----------
  function showAuth() {
    $('authView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('userBar').style.display = 'none';
  }
  function showApp() {
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('userBar').style.display = 'flex';
    if (state.user) $('userEmail').textContent = state.user.email || '';
  }

  // ---------- Anti-bot: câu tính + bẫy ẩn + khóa tạm sau 5 lần sai ----------
  // LƯU Ý TRUNG THỰC: các kiểm tra phía client này chỉ cản bot đơn giản.
  // Chống bot thật phải bật CAPTCHA trong Supabase Dashboard (README bước 4).
  var captchaA = 0, captchaB = 0;
  function newCaptcha() {
    captchaA = 3 + Math.floor(Math.random() * 7);
    captchaB = 2 + Math.floor(Math.random() * 8);
    $('captchaQuestion').textContent = captchaA + ' + ' + captchaB + ' = ?';
    $('captchaAnswer').value = '';
  }
  function lockInfo() {
    try { return JSON.parse(localStorage.getItem('nk_lockout') || '{"count":0,"until":0}'); } catch (e) { return { count: 0, until: 0 }; }
  }
  function setLock(info) { try { localStorage.setItem('nk_lockout', JSON.stringify(info)); } catch (e) {} }
  function recordFail() {
    var info = lockInfo(); info.count += 1;
    if (info.count >= 5) { info.until = Date.now() + 10 * 60 * 1000; info.count = 0; }
    setLock(info); return info;
  }
  function refreshLockMsg() {
    var info = lockInfo();
    if (info.until > Date.now()) {
      var mins = Math.ceil((info.until - Date.now()) / 60000);
      $('lockMsg').textContent = 'Đã khóa tạm ' + mins + ' phút sau 5 lần sai. Hãy thử lại sau.';
      $('authSubmit').disabled = true;
    } else {
      $('lockMsg').textContent = '';
      $('authSubmit').disabled = false;
    }
  }
  newCaptcha(); refreshLockMsg(); setInterval(refreshLockMsg, 30000);

  // ---------- Auth ----------
  $('tabLogin').addEventListener('click', function () {
    state.mode = 'login'; $('tabLogin').classList.add('active'); $('tabRegister').classList.remove('active');
    $('authTitle').textContent = 'Đăng nhập'; $('authSubmit').textContent = 'Đăng nhập';
  });
  $('tabRegister').addEventListener('click', function () {
    state.mode = 'register'; $('tabRegister').classList.add('active'); $('tabLogin').classList.remove('active');
    $('authTitle').textContent = 'Đăng ký'; $('authSubmit').textContent = 'Đăng ký';
  });
     // ---------- Quên mật khẩu (PATCH) ----------
  function showForgot() { $('authForm').classList.add('hidden'); $('forgotView').classList.remove('hidden'); $('newPasswordView').classList.add('hidden'); $('resetEmail').value = $('authEmail').value || ''; }
  function showLoginForm() { $('authForm').classList.remove('hidden'); $('forgotView').classList.add('hidden'); $('newPasswordView').classList.add('hidden'); }
  function showNewPassword() { showAuth(); $('authForm').classList.add('hidden'); $('forgotView').classList.add('hidden'); $('newPasswordView').classList.remove('hidden'); }
  $('forgotBtn').addEventListener('click', showForgot);
  $('backToLoginBtn').addEventListener('click', showLoginForm);
  $('sendResetBtn').addEventListener('click', async function () {
    if (!configured || !supabase) { $('resetMsg').textContent = 'Chưa cấu hình Supabase. Mở file index.html trên GitHub, tìm SUPABASE_ANON_KEY, dán key Publishable vào rồi Commit lại.'; return; }
    var email = $('resetEmail').value.trim();
    if (!email) { $('resetMsg').textContent = 'Hãy nhập email đã đăng ký.'; return; }
    $('resetMsg').textContent = 'Đang gửi mail...';
    var redirectTo = window.location.origin + window.location.pathname;
    var res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    if (res.error) { $('resetMsg').textContent = 'Lỗi: ' + res.error.message; return; }
    $('resetMsg').textContent = 'Đã gửi mail đặt lại mật khẩu. Kiểm tra hộp thư (cả Spam), bấm link trong mail rồi đặt mật khẩu mới.';
  });
  $('setNewPasswordBtn').addEventListener('click', async function () {
    if (!supabase) return;
    var p1 = $('newPassword').value, p2 = $('newPassword2').value;
    if (p1.length < 6) { $('newPassMsg').textContent = 'Mật khẩu mới phải ít nhất 6 ký tự.'; return; }
    if (p1 !== p2) { $('newPassMsg').textContent = 'Hai mật khẩu mới chưa giống nhau.'; return; }
    $('newPassMsg').textContent = 'Đang đặt lại...';
    var res = await supabase.auth.updateUser({ password: p1 });
    if (res.error) { $('newPassMsg').textContent = 'Lỗi: ' + res.error.message; return; }
    $('newPassMsg').textContent = 'Đã đặt mật khẩu mới. Hãy đăng nhập lại bằng mật khẩu mới.';
    try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
    setTimeout(showLoginForm, 1200);
  });
  if (supabase) {
    supabase.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') showNewPassword();
    });
    if (window.location.hash && window.location.hash.indexOf('type=recovery') !== -1) showNewPassword();
  }
Hàm showAuth mới (thay hàm cũ):
  function showAuth() {
    $('authView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('userBar').style.display = 'none';
    if ($('forgotView')) $('forgotView').classList.add('hidden');
    if ($('newPasswordView')) $('newPasswordView').classList.add('hidden');
    if ($('authForm')) $('authForm').classList.remove('hidden');
  }
   
  $('authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!configured || !supabase) { $('authMsg').textContent = 'Chưa cấu hình Supabase. Xem README.md bước 1–5.'; return; }
    refreshLockMsg();
    if (lockInfo().until > Date.now()) return;
    if ($('honeypot').value) { $('authMsg').textContent = 'Bị chặn vì nghi là bot.'; return; }
    if (parseInt($('captchaAnswer').value, 10) !== captchaA + captchaB) {
      $('authMsg').textContent = 'Đáp án chống bot chưa đúng. Thử câu mới nhé.';
      newCaptcha(); recordFail(); refreshLockMsg(); return;
    }
    var email = $('authEmail').value.trim();
    var password = $('authPassword').value;
    $('authMsg').textContent = 'Đang xử lý...';
    var res;
    if (state.mode === 'register') res = await supabase.auth.signUp({ email: email, password: password });
    else res = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (res.error) {
      $('authMsg').textContent = 'Lỗi: ' + res.error.message;
      recordFail(); refreshLockMsg(); newCaptcha(); return;
    }
    setLock({ count: 0, until: 0 });
    if (res.data && res.data.user) {
      state.user = res.data.user;
      await recordSession();
      showApp(); await loadAll();
      $('authMsg').textContent = '';
    } else {
      $('authMsg').textContent = 'Hãy kiểm tra email để xác nhận tài khoản (nếu project bật xác nhận email), rồi đăng nhập lại.';
      newCaptcha();
    }
  });

  // Đăng xuất: QUAY VỀ NGAY trang đăng nhập trước, rồi mới signOut ở nền.
  // Đây là cách sửa lỗi kẹt màn hình trắng be trước đây.
  var loggingOut = false;
  function doLogout() {
    if (loggingOut) return; loggingOut = true;
    try { if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); } catch (e) {}
    state.user = null; state.diary = []; state.tasks = []; state.playlist = []; state.sessions = [];
    state.trackIndex = -1; $('nowPlaying').textContent = 'Chưa phát bài nào.';
    showAuth(); newCaptcha();
    loggingOut = false;
    if (supabase) {
      // Nền: xóa phiên hiện tại rồi signOut, không chờ kết quả mới đổi màn hình.
      var sid = getSessionId();
      supabase.from('login_sessions').delete().eq('session_id', sid).then(function () {
        return supabase.auth.signOut();
      }).catch(function () {});
    }
  }
  $('logoutBtn').addEventListener('click', doLogout);

  async function recordSession() {
    if (!supabase || !state.user) return;
    var info = deviceInfo(); var sid = getSessionId();
    var existing = await supabase.from('login_sessions').select('id').eq('session_id', sid).maybeSingle();
    if (existing.data) {
      await supabase.from('login_sessions').update({ last_activity: new Date().toISOString() }).eq('session_id', sid);
    } else {
      await supabase.from('login_sessions').insert({
        user_id: state.user.id, session_id: sid, device: info.device,
        browser: info.browser, os: info.os, timezone: info.timezone,
        login_at: new Date().toISOString(), last_activity: new Date().toISOString()
      });
    }
  }
  // Các thiết bị khác bị thu hồi phiên sẽ tự đăng xuất khi kiểm tra định kỳ.
  setInterval(async function () {
    if (!supabase || !state.user) return;
    var sid = getSessionId();
    var r = await supabase.from('login_sessions').select('id').eq('session_id', sid).maybeSingle();
    if (!r.data) doLogout();
    else supabase.from('login_sessions').update({ last_activity: new Date().toISOString() }).eq('session_id', sid).then(function () {});
  }, 30000);

  // ---------- Load / render ----------
  async function loadAll() {
    if (!supabase || !state.user) return;
    var uid = state.user.id;
    var d = await supabase.from('diary_entries').select('*').eq('user_id', uid).order('entry_date', { ascending: false });
    state.diary = d.data || [];
    var t = await supabase.from('tasks').select('*').eq('user_id', uid).order('task_date', { ascending: true });
    state.tasks = t.data || [];
    var p = await supabase.from('playlist_items').select('*').eq('user_id', uid).order('created_at', { ascending: true });
    state.playlist = p.data || [];
    var s = await supabase.from('login_sessions').select('*').eq('user_id', uid).order('last_activity', { ascending: false });
    state.sessions = s.data || [];
    renderDiaryList(); renderWeek(); renderStats(); renderPlaylist(); renderSessions();
    // Nạp trang nhật ký hôm nay nếu có
    var today = localDateStr(new Date());
    var found = state.diary.find(function (x) { return x.entry_date === today; });
    if (found) loadDiaryEntry(found);
  }

  function applyDiaryStyle() {
    var ta = $('diaryContent');
    ta.style.fontFamily = $('diaryFont').value;
    ta.style.fontSize = $('diarySize').value + 'px';
    ta.style.color = $('diaryColor').value;
    ta.style.fontWeight = state.diaryBold ? '700' : '400';
    ta.style.fontStyle = state.diaryItalic ? 'italic' : 'normal';
    ta.style.textDecoration = state.diaryUnderline ? 'underline' : 'none';
  }
  ['diaryFont', 'diarySize', 'diaryColor'].forEach(function (id) { $(id).addEventListener('input', applyDiaryStyle); $(id).addEventListener('change', applyDiaryStyle); });
  $('btnBold').addEventListener('click', function () { state.diaryBold = !state.diaryBold; applyDiaryStyle(); });
  $('btnItalic').addEventListener('click', function () { state.diaryItalic = !state.diaryItalic; applyDiaryStyle(); });
  $('btnUnderline').addEventListener('click', function () { state.diaryUnderline = !state.diaryUnderline; applyDiaryStyle(); });

  function loadDiaryEntry(e) {
    $('diaryDate').value = e.entry_date;
    $('diaryTitle').value = e.title || '';
    $('diaryContent').value = e.content || '';
    if (e.font) $('diaryFont').value = e.font;
    if (e.font_size) $('diarySize').value = String(e.font_size);
    if (e.color) $('diaryColor').value = e.color;
    state.diaryBold = !!e.bold; state.diaryItalic = !!e.italic; state.diaryUnderline = !!e.underline;
    applyDiaryStyle();
  }
  $('newDiary').addEventListener('click', function () {
    $('diaryDate').value = localDateStr(new Date()); $('diaryTitle').value = ''; $('diaryContent').value = '';
    state.diaryBold = false; state.diaryItalic = false; state.diaryUnderline = false; applyDiaryStyle();
  });
  $('diaryDate').value = localDateStr(new Date());
  applyDiaryStyle();

  $('saveDiary').addEventListener('click', async function () {
    if (!supabase || !state.user) return;
    var row = {
      user_id: state.user.id, entry_date: $('diaryDate').value || localDateStr(new Date()),
      title: $('diaryTitle').value, content: $('diaryContent').value,
      font: $('diaryFont').value, font_size: parseInt($('diarySize').value, 10),
      bold: state.diaryBold, italic: state.diaryItalic, underline: state.diaryUnderline,
      color: $('diaryColor').value
    };
    var r = await supabase.from('diary_entries').upsert(row, { onConflict: 'user_id,entry_date' }).select().single();
    if (r.error) { $('diaryMsg').textContent = 'Lỗi lưu: ' + r.error.message; return; }
    $('diaryMsg').textContent = 'Đã lưu.';
    await loadAll();
  });

  function renderDiaryList() {
    $('diaryList').innerHTML = state.diary.length ? '' : '<p class="muted">Chưa có trang nào.</p>';
    state.diary.forEach(function (e) {
      var div = document.createElement('div'); div.className = 'task';
      div.innerHTML = '<div><strong>' + esc(e.entry_date) + '</strong> — ' + esc(e.title || '(không tiêu đề)') +
        '<div class="small muted">' + esc((e.content || '').slice(0, 120)) + '</div></div>' +
        '<button type="button" data-open="' + e.id + '">Mở</button>' +
        '<button type="button" data-del="' + e.id + '">Xóa</button>';
      div.querySelector('[data-open]').addEventListener('click', function () { loadDiaryEntry(e); });
      div.querySelector('[data-del]').addEventListener('click', async function () {
        await supabase.from('diary_entries').delete().eq('id', e.id); await loadAll();
      });
      $('diaryList').appendChild(div);
    });
  }

  // ---------- Lịch tuần ----------
  function currentMonday() { var base = new Date(); base.setDate(base.getDate() + state.weekOffset * 7); return mondayOf(base); }
  function renderWeek() {
    var mon = currentMonday(); var sun = addDays(mon, 6);
    $('weekLabel').textContent = 'Tuần: ' + localDateStr(mon) + ' đến ' + localDateStr(sun);
    var today = localDateStr(new Date());
    $('weekDays').innerHTML = '';
    for (var i = 0; i < 7; i++) {
      var day = addDays(mon, i); var ds = localDateStr(day);
      var dayDiv = document.createElement('div'); dayDiv.className = 'day' + (ds === today ? ' today' : '');
      var names = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
      dayDiv.innerHTML = '<strong>' + names[i] + ' — ' + ds + '</strong>';
      var dayTasks = state.tasks.filter(function (t) { return t.task_date === ds; });
      if (!dayTasks.length) dayDiv.innerHTML += '<p class="muted small">Chưa có việc.</p>';
      dayTasks.forEach(function (t) {
        var el = document.createElement('div'); el.className = 'task' + (t.done ? ' done' : '');
        el.innerHTML = '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' aria-label="Đã xong">' +
          '<div style="flex:1"><div class="task-title"><strong>' + esc(t.title) + '</strong> ' + (t.time ? '(' + esc(t.time) + ')' : '') + '</div>' +
          '<div class="small muted">' + esc(t.note || '') + '</div></div>' +
          '<button type="button">Xóa</button>';
        el.querySelector('input').addEventListener('change', async function (ev) {
          await supabase.from('tasks').update({ done: ev.target.checked }).eq('id', t.id); await loadAll();
        });
        el.querySelector('button').addEventListener('click', async function () {
          await supabase.from('tasks').delete().eq('id', t.id); await loadAll();
        });
        dayDiv.appendChild(el);
      });
      $('weekDays').appendChild(dayDiv);
    }
    renderStats();
  }
  $('prevWeek').addEventListener('click', function () { state.weekOffset -= 1; renderWeek(); });
  $('nextWeek').addEventListener('click', function () { state.weekOffset += 1; renderWeek(); });
  $('todayWeek').addEventListener('click', function () { state.weekOffset = 0; renderWeek(); });

  function openSheet(editTask) {
    state.editingTaskId = editTask ? editTask.id : null;
    $('taskDate').value = editTask ? editTask.task_date : localDateStr(new Date());
    $('taskTime').value = editTask ? (editTask.time || '') : '';
    $('taskTitle').value = editTask ? editTask.title : '';
    $('taskNote').value = editTask ? (editTask.note || '') : '';
    $('taskSheet').classList.remove('hidden'); $('sheetBackdrop').classList.remove('hidden');
  }
  function closeSheet() { $('taskSheet').classList.add('hidden'); $('sheetBackdrop').classList.add('hidden'); }
  $('openAddTask').addEventListener('click', function () { openSheet(null); });
  $('closeSheet').addEventListener('click', closeSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);
  $('saveTask').addEventListener('click', async function () {
    if (!supabase || !state.user) return;
    var row = {
      user_id: state.user.id, task_date: $('taskDate').value || localDateStr(new Date()),
      time: $('taskTime').value || null, title: $('taskTitle').value, note: $('taskNote').value
    };
    if (state.editingTaskId) await supabase.from('tasks').update(row).eq('id', state.editingTaskId);
    else await supabase.from('tasks').insert(row);
    closeSheet(); await loadAll();
  });

  // ---------- Thống kê ----------
  function weekRate(mon) {
    var start = localDateStr(mon), end = localDateStr(addDays(mon, 6));
    var list = state.tasks.filter(function (t) { return t.task_date >= start && t.task_date <= end; });
    var done = list.filter(function (t) { return t.done; }).length;
    return { total: list.length, done: done, pct: list.length ? Math.round(done * 100 / list.length) : 0 };
  }
  function renderStats() {
    var mon = currentMonday(); var r = weekRate(mon);
    var circle = $('weekCircle');
    circle.textContent = r.pct + '%';
    circle.style.background = 'conic-gradient(var(--green) ' + r.pct + '%, var(--surface-alt) 0)';
    $('weekCount').textContent = r.done + '/' + r.total + ' việc đã xong';
    var today = localDateStr(new Date());
    var td = state.tasks.filter(function (t) { return t.task_date === today; });
    var tdDone = td.filter(function (t) { return t.done; }).length;
    $('todayCount').textContent = tdDone + '/' + td.length;
    var overdue = state.tasks.filter(function (t) { return !t.done && t.task_date < today; }).length;
    $('overdueCount').textContent = overdue;
    var names = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    var html = '';
    for (var i = 0; i < 7; i++) {
      var ds = localDateStr(addDays(mon, i));
      var list = state.tasks.filter(function (t) { return t.task_date === ds; });
      var done = list.filter(function (t) { return t.done; }).length;
      var pct = list.length ? Math.round(done * 100 / list.length) : 0;
      html += '<div class="task"><span style="flex:1">' + names[i] + ' — ' + ds + '</span><span>' + done + '/' + list.length + ' · ' + pct + '%</span></div>';
    }
    $('perDay').innerHTML = html;
    var chart = '';
    for (var w = 7; w >= 0; w--) {
      var base = new Date(); base.setDate(base.getDate() - w * 7);
      var wr = weekRate(mondayOf(base));
      chart += '<div class="bar" style="height:' + Math.max(6, wr.pct) + '%" title="' + wr.pct + '%">' + wr.pct + '%<span>W-' + w + '</span></div>';
    }
    $('chart8').innerHTML = chart;
  }

  // ---------- Nhạc ----------
  function parseMusic(url) {
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return { provider: 'youtube', kind: 'video', extId: yt[1] };
    var sp = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);
    if (sp) return { provider: 'spotify', kind: sp[1], extId: sp[2] };
    return null;
  }
  $('addMusic').addEventListener('click', async function () {
    if (!supabase || !state.user) return;
    var url = $('musicUrl').value.trim(); var parsed = parseMusic(url);
    if (!parsed) { $('musicMsg').textContent = 'Link chưa nhận diện được. Hãy dán link YouTube hoặc Spotify hợp lệ.'; return; }
    var r = await supabase.from('playlist_items').insert({
      user_id: state.user.id, provider: parsed.provider, kind: parsed.kind,
      ext_id: parsed.extId, url: url, title: parsed.provider === 'youtube' ? 'YouTube · ' + parsed.extId : 'Spotify · ' + parsed.kind
    });
    if (r.error) { $('musicMsg').textContent = 'Lỗi: ' + r.error.message; return; }
    $('musicMsg').textContent = 'Đã thêm vào danh sách phát.'; $('musicUrl').value = '';
    await loadAll();
  });
  function renderPlaylist() {
    $('playlist').innerHTML = state.playlist.length ? '' : '<p class="muted">Chưa có bài nào.</p>';
    state.playlist.forEach(function (item, idx) {
      var div = document.createElement('div');
      div.className = 'playlist-item' + (idx === state.trackIndex ? ' playing' : '');
      div.innerHTML = '<div style="flex:1">' + esc(item.title || item.url) + '<div class="small muted">' + esc(item.provider) + ' · ' + esc(item.kind || '') + '</div></div>' +
        '<button type="button" data-play="' + idx + '">Phát</button>' +
        '<button type="button" data-del="' + item.id + '">Xóa</button>';
      div.querySelector('[data-play]').addEventListener('click', function () { playTrack(idx); });
      div.querySelector('[data-del]').addEventListener('click', async function () {
        await supabase.from('playlist_items').delete().eq('id', item.id); await loadAll();
      });
      $('playlist').appendChild(div);
    });
  }

  // YouTube IFrame API — trình phát nằm ở #yt-player-root ngoài màn hình app,
  // nên đăng xuất / chuyển màn hình không gỡ nó, tránh lỗi trắng be.
  var ytPlayer = null, ytReady = false, seekTimer = null;
  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) { createYTPlayer(); return; }
    var tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function () { createYTPlayer(); };
  }
  function createYTPlayer() {
    if (ytPlayer) return;
    try {
      ytPlayer = new window.YT.Player('yt-player', {
        height: '1', width: '1',
        playerVars: { playsinline: 1, controls: 0 },
        events: { onReady: function () { ytReady = true; }, onStateChange: function () {} }
      });
    } catch (e) { ytReady = false; }
  }
  loadYouTubeAPI();
  function playTrack(idx) {
    if (!state.playlist.length) return;
    state.trackIndex = idx;
    var item = state.playlist[idx];
    $('nowPlaying').textContent = 'Đang phát: ' + (item.title || item.url);
    renderPlaylist();
    if (item.provider === 'spotify') {
      $('spotifyEmbed').classList.remove('hidden');
      $('spotifyEmbed').src = 'https://open.spotify.com/embed/' + item.kind + '/' + item.ext_id;
    } else {
      $('spotifyEmbed').classList.add('hidden');
      if (ytReady && ytPlayer && ytPlayer.loadVideoById) ytPlayer.loadVideoById(item.ext_id);
      else $('nowPlaying').textContent += ' (YouTube chưa tải xong — thử lại sau vài giây. Nếu mạng chặn YouTube, trình phát sẽ không tải được.)';
    }
  }
  $('btnPlayPause').addEventListener('click', function () {
    if (state.trackIndex < 0) { playTrack(0); return; }
    var item = state.playlist[state.trackIndex];
    if (item && item.provider === 'youtube' && ytPlayer) {
      try {
        var st = ytPlayer.getPlayerState();
        if (st === 1) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
      } catch (e) {}
    }
  });
  $('btnNext').addEventListener('click', function () { if (state.playlist.length) playTrack((state.trackIndex + 1) % state.playlist.length); });
  $('btnPrev').addEventListener('click', function () { if (state.playlist.length) playTrack((state.trackIndex - 1 + state.playlist.length) % state.playlist.length); });
  $('volumeRange').addEventListener('input', function (e) { if (ytPlayer && ytPlayer.setVolume) { try { ytPlayer.setVolume(parseInt(e.target.value, 10)); } catch (err) {} } });
  $('seekRange').addEventListener('input', function (e) {
    if (ytPlayer && ytPlayer.seekTo && ytPlayer.getDuration) {
      try { var d = ytPlayer.getDuration(); ytPlayer.seekTo(d * parseInt(e.target.value, 10) / 100, true); } catch (err) {}
    }
  });
  seekTimer = setInterval(function () {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
      try { var d = ytPlayer.getDuration(); var c = ytPlayer.getCurrentTime(); if (d > 0) $('seekRange').value = Math.round(c * 100 / d); } catch (e) {}
    }
  }, 500);

  // ---------- Bảo mật / Xuất dữ liệu ----------
  function renderSessions() {
    var sid = getSessionId();
    $('sessionList').innerHTML = state.sessions.length ? '' : '<p class="muted">Chưa có phiên nào.</p>';
    state.sessions.forEach(function (s) {
      var div = document.createElement('div'); div.className = 'task';
      var isCurrent = s.session_id === sid;
      div.innerHTML = '<div style="flex:1"><strong>' + esc(s.device || '') + ' · ' + esc(s.browser || '') + ' · ' + esc(s.os || '') + '</strong>' +
        (isCurrent ? ' <span class="small">(phiên này)</span>' : '') +
        '<div class="small muted">Nơi đăng nhập (theo múi giờ trình duyệt): ' + esc(s.timezone || '') +
        '<br>Đăng nhập: ' + esc(s.login_at || '') + ' · Hoạt động gần nhất: ' + esc(s.last_activity || '') + '</div></div>' +
        (isCurrent ? '' : '<button type="button">Thu hồi</button>');
      if (!isCurrent) {
        div.querySelector('button').addEventListener('click', async function () {
          await supabase.from('login_sessions').delete().eq('id', s.id); await loadAll();
        });
      }
      $('sessionList').appendChild(div);
    });
  }
  $('signOutOthers').addEventListener('click', async function () {
    if (!supabase || !state.user) return;
    var sid = getSessionId();
    await supabase.from('login_sessions').delete().eq('user_id', state.user.id).neq('session_id', sid);
    alert('Đã thu hồi các phiên khác. Các thiết bị đó sẽ tự đăng xuất khi ứng dụng kiểm tra phiên (tối đa ~30 giây) hoặc khi mở lại trang.');
    await loadAll();
  });
  $('exportJson').addEventListener('click', async function () {
    if (!supabase || !state.user) return;
    var data = { user: state.user.email, exported_at: new Date().toISOString(), diary: state.diary, tasks: state.tasks, playlist: state.playlist };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nhat-ky-backup.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  // ---------- Tabs ----------
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      ['diary', 'week', 'stats', 'music', 'security'].forEach(function (k) {
        $('panel-' + k).classList.toggle('hidden', k !== b.getAttribute('data-tab'));
      });
      if (b.getAttribute('data-tab') === 'stats') renderStats();
      if (b.getAttribute('data-tab') === 'week') renderWeek();
    });
  });

  // ---------- Khởi động ----------
  (async function init() {
    if (!configured) { $('configWarning').classList.remove('hidden'); showAuth(); return; }
    if (!supabase) { showAuth(); return; }
    var res = await supabase.auth.getSession();
    if (res.data && res.data.session && res.data.session.user) {
      state.user = res.data.session.user;
      await recordSession();
      showApp(); await loadAll();
    } else {
      showAuth();
    }
  })();
})();
