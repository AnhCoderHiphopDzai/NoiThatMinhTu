(() => {
  'use strict';
  const form = document.getElementById('quote-form');
  if (!form) return;
  const submitButton = document.getElementById('submit-button');
  const formStatus = document.getElementById('form-status');
  const scriptURL = form.action;
  let pendingRequest;
  let sending = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    const body = new URLSearchParams(new FormData(form));
    const fingerprint = body.toString();
    if (!pendingRequest || pendingRequest.fingerprint !== fingerprint) {
      const id = globalThis.crypto?.randomUUID?.() ||
        Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
      pendingRequest = { id, fingerprint };
    }
    body.set('request_id', pendingRequest.id);
    sending = true;
    const controls = [...form.elements];
    const disabledStates = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Đang gửi...';
    formStatus.hidden = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      // A simple form POST avoids a CORS preflight. Do not use no-cors: its
      // opaque response cannot confirm that Apps Script actually saved the lead.
      const response = await fetch(scriptURL, {
        method: 'POST', body, mode: 'cors', credentials: 'omit', redirect: 'follow', signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP_' + response.status);
      const result = await response.json();
      if (result.result === 'error') {
        formStatus.textContent = result.code === 'INVALID_INPUT'
          ? result.message
          : 'Chưa lưu được yêu cầu. Vui lòng thử lại sau hoặc gọi 0913 188 919.';
        formStatus.style.color = '#a8311b';
        return;
      }
      if (result.result !== 'success' || result.saved !== true || result.requestId !== pendingRequest.id) {
        throw new Error('UNCONFIRMED_RESPONSE');
      }
      form.reset();
      pendingRequest = undefined;
      formStatus.textContent = 'Đã nhận yêu cầu tư vấn. Minh Tú sẽ liên hệ với bạn theo thông tin đã cung cấp.';
      formStatus.style.color = 'var(--green)';
    } catch (error) {
      // A timeout/network failure may happen after the server saved the request.
      // Keep both the entered values and request ID so a retry is safe.
      formStatus.textContent = 'Chưa xác nhận được kết quả gửi. Thông tin của bạn vẫn được giữ lại. Bạn có thể thử lại hoặc gọi 0913 188 919 để kiểm tra.';
      formStatus.style.color = '#a8311b';
    } finally {
      clearTimeout(timeout);
      sending = false;
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
      form.removeAttribute('aria-busy');
      formStatus.hidden = false;
      submitButton.textContent = 'Gửi yêu cầu';
    }
  });
})();
