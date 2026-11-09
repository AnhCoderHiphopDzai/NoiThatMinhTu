// Paste into the Apps Script project used by the website's /exec deployment.
// Store TELEGRAM_BOT_TOKEN in Project Settings > Script properties, never in HTML.
const QUOTE_CONFIG = Object.freeze({
  spreadsheetId: '1ZetMEUw-BuhdyDCXkGENOJx3_51gj71SzssklJG-Q_s',
  sheetId: 0,
  telegramChatId: '1652285957'
});
const QUOTE_COLUMNS = Object.freeze({ serial: 1, timestamp: 2, name: 3, phone: 4, email: 5, projectType: 6, message: 7, status: 8, requestId: 9 });
const QUOTE_HEADERS = Object.freeze(['STT', 'Thời gian', 'Tên khách hàng', 'Số điện thoại', 'Email', 'Loại hình', 'Lời nhắn.', 'Trạng thái', 'ID']);
const PROJECT_TYPES = Object.freeze({
  'nha-hang': 'Nhà hàng – quán ăn',
  'truong-hoc': 'Trường học',
  'van-phong': 'Công ty – văn phòng',
  'dan-dung': 'Công trình dân dụng',
  'khac': 'Khác'
});

// Opening /exec in an incognito browser must show this JSON without signing in.
function doGet() {
  return json_({ service: 'minh-tu-quotes', version: '2026-11-09.2', method: 'POST' });
}

function doPost(e) {
  if (!e || !e.parameter) {
    return json_({ result: 'error', code: 'NO_POST_DATA', message: 'doPost nhận dữ liệu từ website. Để kiểm tra bằng nút Run, hãy chọn diagnoseConfiguration.' });
  }

  let data;
  try {
    data = readQuote_(e.parameter);
  } catch (error) {
    return json_({ result: 'error', code: 'INVALID_INPUT', message: error.message });
  }

  let sheet;
  let row;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return json_({ result: 'error', code: 'BUSY', message: 'Hệ thống đang bận. Vui lòng thử gửi lại sau ít phút.' });
  }
  try {
    sheet = getQuoteSheet_();
    const lastRow = sheet.getLastRow();
    // A request retried after a lost response must not create another row/message.
    if (lastRow > 1 && sheet.getLastColumn() >= QUOTE_COLUMNS.requestId) {
      const existing = sheet.getRange(2, QUOTE_COLUMNS.requestId, lastRow - 1, 1)
        .createTextFinder(data.requestId).matchEntireCell(true).findNext();
      if (existing) {
        return json_({ result: 'success', saved: true, duplicate: true, requestId: data.requestId });
      }
    }
    if (lastRow === 0) {
      sheet.appendRow([...QUOTE_HEADERS]);
    }
    // A:I follows the customer sheet. STT is a number, not an array formula.
    const serial = nextSerial_(sheet, lastRow);
    sheet.appendRow([
      serial, new Date(), cellText_(data.name), cellText_(data.phone),
      cellText_(data.email), cellText_(data.projectType), cellText_(data.message), 'Đang gửi', data.requestId
    ]);
    row = sheet.getLastRow();
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('SHEET_WRITE_FAILED: kiểm tra quyền chỉnh sửa bảng, ID bảng và gid=0.');
    return json_({ result: 'error', code: 'SHEET_WRITE_FAILED', message: 'Chưa lưu được yêu cầu. Vui lòng gọi 0913 188 919 hoặc thử lại sau.' });
  } finally {
    lock.releaseLock();
  }

  // Sheets is the source of truth. A Telegram failure must not discard a lead.
  let notification;
  try {
    notification = notifyTelegram_(data);
  } catch (error) {
    notification = { sent: false, status: 'Lỗi kết nối Telegram; kiểm tra Executions và cấu hình bot.' };
    console.warn('TELEGRAM_NETWORK_ERROR: yêu cầu đã được lưu trong Sheets.');
  }
  try {
    sheet.getRange(row, QUOTE_COLUMNS.status).setValue(notification.status);
    SpreadsheetApp.flush();
  } catch (error) {
    // The lead is already committed even if updating the notification status fails.
    console.warn('TELEGRAM_STATUS_WRITE_FAILED: yêu cầu đã được lưu trong Sheets.');
  }
  return json_({ result: 'success', saved: true, telegramSent: notification.sent, requestId: data.requestId });
}

function getQuoteSheet_() {
  const sheet = SpreadsheetApp.openById(QUOTE_CONFIG.spreadsheetId).getSheetById(QUOTE_CONFIG.sheetId);
  if (!sheet) throw new Error('Không tìm thấy tab có gid=0 trong bảng nhận báo giá.');
  return sheet;
}

function nextSerial_(sheet, lastRow) {
  if (lastRow <= 1) return 1;
  // Ignore #REF!, dates and other values left by the old column mapping.
  // Use the largest existing STT to avoid repeats after sorting/deleting rows.
  const values = sheet.getRange(2, QUOTE_COLUMNS.serial, lastRow - 1, 1).getValues();
  return values.reduce((highest, [value]) => {
    const number = typeof value === 'number' ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : 0;
    return Number.isSafeInteger(number) && number > highest ? number : highest;
  }, lastRow - 1) + 1;
}

function readQuote_(params) {
  const read = (key, limit) => {
    const value = String(params[key] || '').trim();
    if (value.length > limit) throw new Error('Thông tin quá dài. Vui lòng rút gọn trước khi gửi.');
    return value;
  };
  const name = read('name', 100);
  const phone = read('phone', 32);
  const email = read('email', 254);
  const message = read('message', 2500);
  const projectCode = read('project_type', 30);
  if (!name) throw new Error('Vui lòng nhập họ và tên.');
  if (!/^[+\d\s().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))) {
    throw new Error('Vui lòng kiểm tra số điện thoại.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vui lòng kiểm tra địa chỉ email.');
  if (projectCode && !Object.prototype.hasOwnProperty.call(PROJECT_TYPES, projectCode)) {
    throw new Error('Vui lòng chọn lại loại công trình.');
  }
  const requestId = read('request_id', 80) || Utilities.getUuid();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) throw new Error('Mã yêu cầu không hợp lệ. Vui lòng tải lại trang.');
  return { name, phone, email, message, projectType: PROJECT_TYPES[projectCode] || 'Chưa chọn', requestId };
}

function cellText_(value) {
  // Preserve phone leading zeros and treat customer input as text, never formulas.
  return value ? "'" + value : '';
}

function notifyTelegram_(data) {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.warn('TELEGRAM_NOT_CONFIGURED: thêm TELEGRAM_BOT_TOKEN vào Script properties.');
    return { sent: false, status: 'Chưa cấu hình TELEGRAM_BOT_TOKEN' };
  }
  const text = 'KHÁCH HÀNG MỚI BÁO GIÁ\n\n' +
    'Tên: ' + data.name + '\n' +
    'SĐT: ' + data.phone + '\n' +
    'Email: ' + (data.email || 'Không cung cấp') + '\n' +
    'Loại công trình: ' + data.projectType + '\n' +
    'Lời nhắn: ' + (data.message || 'Không có') + '\n' +
    'Mã yêu cầu: ' + data.requestId;
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token.trim() + '/sendMessage', {
    method: 'post',
    payload: { chat_id: QUOTE_CONFIG.telegramChatId, text },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let result;
  try { result = JSON.parse(response.getContentText()); } catch (error) { result = {}; }
  if (status === 200 && result.ok === true) return { sent: true, status: 'Đã gửi' };
  const hints = {
    400: 'Kiểm tra chat ID và mở cuộc trò chuyện với bot rồi nhấn Start.',
    401: 'Token bot không hợp lệ hoặc đã bị thu hồi.',
    403: 'Bot bị chặn hoặc không có quyền gửi tới cuộc trò chuyện.',
    429: 'Telegram giới hạn số lần gửi; xem lại sau.'
  };
  const hint = hints[status] || 'Kiểm tra kết nối và trạng thái Telegram.';
  console.warn('TELEGRAM_HTTP_' + status + ': ' + hint);
  return { sent: false, status: 'Lỗi Telegram ' + status + ': ' + hint };
}

// Run this function in the editor, NOT doPost. Read-only: no rows or messages sent.
function diagnoseConfiguration() {
  const sheet = getQuoteSheet_();
  console.log('SHEETS_OK: mở được bảng và tìm thấy tab gid=' + sheet.getSheetId());
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Thêm TELEGRAM_BOT_TOKEN trong Project Settings > Script properties.');
  for (const method of ['getMe', 'getChat']) {
    let response;
    try {
      response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token.trim() + '/' + method, {
        method: 'post',
        payload: method === 'getChat' ? { chat_id: QUOTE_CONFIG.telegramChatId } : {},
        muteHttpExceptions: true
      });
    } catch (error) {
      throw new Error('Không kết nối được Telegram. Kiểm tra quyền UrlFetchApp và thử lại.');
    }
    let body;
    try { body = JSON.parse(response.getContentText()); } catch (error) { body = {}; }
    if (response.getResponseCode() !== 200 || body.ok !== true) {
      throw new Error('Telegram ' + method + ' lỗi HTTP ' + response.getResponseCode() + '. Kiểm tra token, chat ID và nhấn Start với bot.');
    }
  }
  console.log('TELEGRAM_OK: token hợp lệ và tìm thấy cuộc trò chuyện. Chưa gửi tin nhắn thử.');
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
