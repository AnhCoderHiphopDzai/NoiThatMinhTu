const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const backendSource = fs.readFileSync(require('node:path').join(__dirname, '../apps-script/Code.gs'), 'utf8');
const clientSource = fs.readFileSync(require('node:path').join(__dirname, '../assets/quote-form.js'), 'utf8');

function backend(options = {}) {
  const rows = options.rows || [];
  const calls = [];
  const logs = [];
  const sheet = {
    getSheetId: () => 0,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(row => row.length)),
    appendRow: row => rows.push(row),
    getRange(row, column, count = 1) {
      return {
        getValues() { return rows.slice(row - 1, row - 1 + count).map(r => [r[column - 1]]); },
        setValue(value) { rows[row - 1][column - 1] = value; },
        createTextFinder(value) {
          return {
            matchEntireCell() { return this; },
            findNext() { return rows.slice(row - 1, row - 1 + count).some(r => r[column - 1] === value) ? {} : null; }
          };
        }
      };
    }
  };
  const context = vm.createContext({
    console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, '1ZetMEUw-BuhdyDCXkGENOJx3_51gj71SzssklJG-Q_s');
        if (options.sheetFailure) throw new Error('Read/write denied');
        return { getSheetById: id => { assert.equal(id, 0); return options.missingSheet ? null : sheet; } };
      },
      flush() {}
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !options.busy, releaseLock() {} }) },
    Utilities: { getUuid: () => '11111111-2222-4333-8444-555555555555' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => options.noToken ? null : 'test-token-not-a-real-credential' }) },
    UrlFetchApp: {
      fetch(url, settings) {
        calls.push({ method: url.split('/').pop(), settings });
        if (options.networkFailure) throw new Error('Simulated Telegram network failure');
        return {
          getResponseCode: () => options.telegramStatus || 200,
          getContentText: () => JSON.stringify({ ok: !options.telegramStatus })
        };
      }
    }
  });
  vm.runInContext(backendSource, context);
  return { rows, calls, logs, context, post: params => JSON.parse(context.doPost(params === undefined ? undefined : { parameter: params }).text) };
}

const quote = overrides => ({
  name: 'Khách kiểm thử', phone: '0900000000', email: 'test@example.com',
  project_type: 'van-phong', message: 'Dữ liệu giả lập, không gửi thật',
  request_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', ...overrides
});

test('manual Run of doPost returns a useful error without touching Sheets or Telegram', () => {
  const app = backend();
  assert.equal(app.post().code, 'NO_POST_DATA');
  assert.equal(app.rows.length, 0);
  assert.equal(app.calls.length, 0);
});

test('valid lead stores all fields, preserves phone zero, and sends Telegram once', () => {
  const app = backend();
  const result = app.post(quote());
  assert.equal(result.saved, true);
  assert.equal(result.telegramSent, true);
  assert.equal(app.rows.length, 2);
  assert.deepEqual(Array.from(app.rows[0]), ['STT', 'Thời gian', 'Tên khách hàng', 'Số điện thoại', 'Email', 'Loại hình', 'Lời nhắn.', 'Trạng thái', 'ID']);
  assert.equal(app.rows[1].length, 9);
  assert.equal(app.rows[1][0], 1);
  assert.equal(Object.prototype.toString.call(app.rows[1][1]), '[object Date]');
  assert.equal(app.rows[1][2], "'Khách kiểm thử");
  assert.equal(app.rows[1][3], "'0900000000");
  assert.equal(app.rows[1][4], "'test@example.com");
  assert.equal(app.rows[1][5], "'Công ty – văn phòng");
  assert.equal(app.rows[1][6], "'Dữ liệu giả lập, không gửi thật");
  assert.equal(app.rows[1][7], 'Đã gửi');
  assert.equal(app.rows[1][8], quote().request_id);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].method, 'sendMessage');
  assert.match(app.calls[0].settings.payload.text, /test@example.com/);
});

test('retry after a lost response does not duplicate row or notification', () => {
  const app = backend();
  app.post(quote());
  const retry = app.post(quote());
  assert.equal(retry.saved, true);
  assert.equal(retry.duplicate, true);
  assert.equal(app.rows.length, 2);
  assert.equal(app.calls.length, 1);
});

test('Telegram HTTP failure keeps the lead and records the failure', () => {
  const app = backend({ telegramStatus: 403 });
  const result = app.post(quote());
  assert.equal(result.saved, true);
  assert.equal(result.telegramSent, false);
  assert.match(app.rows[1][7], /403/);
});

test('missing token or Telegram network error never discards a saved lead', () => {
  for (const options of [{ noToken: true }, { networkFailure: true }]) {
    const app = backend(options);
    const result = app.post(quote());
    assert.equal(result.saved, true);
    assert.equal(result.telegramSent, false);
    assert.equal(app.rows.length, 2);
    assert(!app.logs.join(' ').includes('test-token-not-a-real-credential'));
  }
});

test('invalid input, missing sheet, sheet permission failure and busy lock do not send Telegram', () => {
  for (const [options, params, code] of [
    [{}, quote({ phone: 'abc' }), 'INVALID_INPUT'],
    [{}, quote({ email: 'invalid' }), 'INVALID_INPUT'],
    [{}, quote({ message: 'x'.repeat(2501) }), 'INVALID_INPUT'],
    [{}, quote({ project_type: '__proto__' }), 'INVALID_INPUT'],
    [{ missingSheet: true }, quote(), 'SHEET_WRITE_FAILED'],
    [{ sheetFailure: true }, quote(), 'SHEET_WRITE_FAILED'],
    [{ busy: true }, quote(), 'BUSY']
  ]) {
    const app = backend(options);
    assert.equal(app.post(params).code, code);
    assert.equal(app.rows.length, 0);
    assert.equal(app.calls.length, 0);
  }
});

test('customer text is stored literally, without running spreadsheet formulas', () => {
  const app = backend();
  app.post(quote({ name: '=1+1', message: '+SUM(1,2)' }));
  assert.equal(app.rows[1][2], "'=1+1");
  assert.equal(app.rows[1][6], "'+SUM(1,2)");
});

test('editor diagnostics only read configuration; they do not append rows or send messages', () => {
  const app = backend();
  app.context.diagnoseConfiguration();
  assert.deepEqual(app.calls.map(call => call.method), ['getMe', 'getChat']);
  assert.equal(app.rows.length, 0);
  assert.equal(JSON.parse(app.context.doGet().text).service, 'minh-tu-quotes');
});

test('STT continues after sorted/deleted rows and ignores malformed legacy cells', () => {
  const app = backend({ rows: [
    ['STT', 'Thời gian', 'Tên khách hàng', 'Số điện thoại', 'Email', 'Loại hình', 'Lời nhắn.', 'Trạng thái', 'ID'],
    [9], ['#REF!'], [new Date()], [2]
  ] });
  assert.equal(app.post(quote()).saved, true);
  assert.equal(app.rows.at(-1)[0], 10);
  assert.equal(app.rows[2][0], '#REF!');
});

test('only the ID in column I is used for deduplication, not the message in G', () => {
  const app = backend();
  app.post(quote({ message: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }));
  const next = app.post(quote({ request_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }));
  assert.equal(next.saved, true);
  assert.equal(next.duplicate, undefined);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][0], 2);
  assert.equal(app.calls.length, 2);
});

function client(fetchImpl) {
  let onSubmit;
  let timer;
  let resets = 0;
  const calls = [];
  const fields = { name: 'Khách kiểm thử', phone: '0900000000', email: 'test@example.com', project_type: 'van-phong', message: 'Giả lập' };
  const button = { disabled: false, textContent: 'Gửi yêu cầu' };
  const controls = [button, { disabled: false }, { disabled: true }];
  const status = { hidden: true, style: {}, textContent: '' };
  const form = {
    action: 'https://example.invalid/exec', elements: controls, reportValidity: () => true,
    addEventListener: (type, handler) => { if (type === 'submit') onSubmit = handler; },
    setAttribute() {}, removeAttribute() {}, reset() { resets++; }
  };
  const context = vm.createContext({
    document: { getElementById: id => ({ 'quote-form': form, 'submit-button': button, 'form-status': status })[id] },
    FormData: class { constructor() { return Object.entries(fields); } },
    URLSearchParams, AbortController, crypto: webcrypto,
    setTimeout: handler => { timer = handler; return 1; }, clearTimeout: () => { timer = undefined; },
    fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); }
  });
  vm.runInContext(clientSource, context);
  return { form, fields, button, status, controls, calls, submit: () => onSubmit({ preventDefault() {} }), abort: () => timer(), get resets() { return resets; } };
}
const confirmed = (url, options) => ({ ok: true, json: async () => ({ result: 'success', saved: true, requestId: options.body.get('request_id'), telegramSent: false }) });

test('client resets only after a matching confirmed save, including Telegram failure', async () => {
  const app = client(confirmed);
  await app.submit();
  assert.equal(app.resets, 1);
  assert.match(app.status.textContent, /Đã nhận yêu cầu/);
  assert.equal(app.calls[0].options.mode, 'cors');
  assert.equal(app.calls[0].options.credentials, 'omit');
  assert.equal(app.calls[0].options.body.get('email'), 'test@example.com');
  assert.deepEqual(app.controls.map(control => control.disabled), [false, false, true]);
});

test('network failure preserves input and reuses the request ID on retry', async () => {
  let fail = true;
  const app = client((...args) => { if (fail) throw new Error('Network error'); return confirmed(...args); });
  await app.submit();
  assert.equal(app.resets, 0);
  assert.match(app.status.textContent, /Chưa xác nhận/);
  fail = false;
  await app.submit();
  assert.equal(app.calls[0].options.body.get('request_id'), app.calls[1].options.body.get('request_id'));
  assert.equal(app.resets, 1);
});

test('editing a failed request creates a new request ID', async () => {
  const app = client(() => { throw new Error('Network error'); });
  await app.submit();
  app.fields.message = 'Nội dung thay đổi';
  await app.submit();
  assert.notEqual(app.calls[0].options.body.get('request_id'), app.calls[1].options.body.get('request_id'));
});

test('HTTP errors, login HTML, old deployment and mismatched acknowledgements never clear the form', async () => {
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => { throw new SyntaxError('HTML sign-in page'); } },
    { ok: true, json: async () => ({ result: 'success' }) },
    { ok: true, json: async () => ({ result: 'success', saved: true, requestId: 'wrong-id' }) },
    { ok: true, json: async () => ({ result: 'error', code: 'SHEET_WRITE_FAILED' }) }
  ]) {
    const app = client(() => response);
    await app.submit();
    assert.equal(app.resets, 0);
    assert.equal(app.button.disabled, false);
    assert.equal(app.status.hidden, false);
    assert(!app.status.textContent.includes('Đã nhận'));
  }
});

test('timeout and duplicate clicks leave input intact and re-enable the form', async () => {
  const app = client((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = app.submit();
  await app.submit();
  assert.equal(app.calls.length, 1);
  app.abort();
  await pending;
  assert.equal(app.resets, 0);
  assert.equal(app.button.disabled, false);
  assert.match(app.status.textContent, /Chưa xác nhận/);
});
