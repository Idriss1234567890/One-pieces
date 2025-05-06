require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

app.use(express.json());

// 1. استخدام متغيرات البيئة بشكل صحيح
const { 
  VERIFY_TOKEN, 
  PAGE_ACCESS_TOKEN, 
  PORT = 3000 
} = process.env;

// 2. إصلاح النهاية المفقودة في app.listen
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// 3. إضافة معالجة الأخطاء وتحسين التحقق من البيانات
app.post('/webhook', async (req, res) => {
  try {
    if (req.body.object !== 'page') {
      return res.sendStatus(404);
    }

    const entry = req.body.entry?.[0];
    if (!entry || !entry.messaging) {
      return res.sendStatus(400);
    }

    const event = entry.messaging[0];
    const senderId = event.sender?.id;
    const userMessage = event.message?.text;

    // 4. التحقق من وجود نص الرسالة
    if (!userMessage?.trim()) {
      return res.sendStatus(200);
    }

    // 5. تحسين إنشاء slug للمانجا
    const mangaSlug = userMessage
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // إزالة الأحرف الخاصة
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-');
    
    const mangaUrl = `https://lekmanga.net/manga/${encodeURIComponent(mangaSlug)}/`;
    
    // 6. إضافة مهلة للطلب
    const mangaInfo = await fetchMangaInfo(mangaUrl);
    
    if (!mangaInfo) {
      await sendTextMessage(senderId, "⚠️ لم يتم العثور على المانجا!");
      return res.sendStatus(200);
    }

    // 7. إرسال الردود بشكل متسلسل
    await Promise.all([
      sendTextMessage(senderId, formatMangaInfo(mangaInfo)),
      sendImage(senderId, mangaInfo.coverImage)
    ]);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error:', error);
    res.sendStatus(500);
  }
});

// 8. تحسين دالة جلب المعلومات
async function fetchMangaInfo(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; manga-bot/1.0)'
      }
    });
    
    const $ = cheerio.load(data);
    
    // 9. تحسين اختيار العناصر
    const chapters = $('.wp-manga-chapter')
      .toArray()
      .filter(el => $(el).find('a').length > 0)
      .length;

    return {
      details: `
        العنوان: ${$('.post-title h1').text().trim()}
        عدد الفصول: ${chapters}
        الملخص: ${$('.description-summary').text().trim().substring(0, 200)}...
      `,
      coverImage: $('.summary_image img').attr('src') || ''
    };
  } catch (error) {
    console.error('Fetch Error:', error.message);
    return null;
  }
}

// 10. استخدام إصدار حديث من API وإدارة الأخطاء
async function sendTextMessage(recipientId, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
        timeout: 5000
      }
    );
  } catch (error) {
    console.error('Message Error:', error.response?.data || error.message);
  }
}

async function sendImage(recipientId, imageUrl) {
  if (!imageUrl) return;
  
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true }
          }
        }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
        timeout: 10000
      }
    );
  } catch (error) {
    console.error('Image Error:', error.response?.data || error.message);
  }
}

// 11. استخدام منفذ قابل للتخصيص
app.listen(PORT, () => 
  console.log(`Server is running on port ${PORT}`)
);

// 12. دالة مساعدة لتنسيق النص
function formatMangaInfo(info) {
  return `📚 معلومات المانجا:\n${info.details.replace(/^\s+/gm, '')}`;
}
