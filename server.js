require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL || 'llama-3.3-70b-versatile';

app.disable('x-powered-by');
app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Сен «Мәшһүр Жүсіп AI» атты қазақ тіліндегі білім беру көмекшісісің. Мәшһүр Жүсіп Көпейұлының өмірі, шығармашылығы, тарихи мұрасы және кесенесі туралы оқушыларға түсінікті ақпарат бер.
Ережелер:
1. Әдетте қазақ тілінде жауап бер; қолданушы басқа тілде сұраса, сол тілде жауап беруге болады.
2. Өзіңді шынайы Мәшһүр Жүсіп деп көрсетпе. Сен — оның мұрасы туралы ақпарат беретін AI көмекшісісің.
3. Ақынның атынан жаңа сөз, дәйексөз, өлең немесе жеке естелік ойлап шығарма. Дәйексөздің дұрыстығына сенімді болмасаң, оны ашық айт.
4. Нақты дерекке сенімді болмасаң, оны сенімді дереккөзден тексеру керегін ескерт.
5. Кесененің орналасуы, сәулеті, жөнделуі туралы тексерілмеген деректерді ойдан қоспа.
6. Ғылыми жобаға көмектескенде тарихи дерек пен аңызды ажыратуды, дереккөздерді салыстыруды ұсын.
7. Жауаптарды түсінікті, сыпайы және оқушы деңгейіне сай бер.`;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(API_KEY), model: MODEL });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: 'API кілті орнатылмаған. Сервердегі .env файлына API_KEY енгізіңіз.' });
    }
    const messages = req.body && req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Хабарлама табылмады.' });
    }
    const safeMessages = messages
      .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.trim().slice(0, 4000) }))
      .filter(m => m.content.length > 0);
    if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Соңғы хабарлама пайдаланушыдан болуы керек.' });
    }
    const upstream = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
        temperature: 0.5,
        max_tokens: 900
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('AI provider error:', upstream.status, data?.error?.message || 'Unknown error');
      let message = 'AI қызметіне қосылу кезінде қате шықты. Сервер баптауларын тексеріңіз.';
      if (upstream.status === 401) message = 'API кілті жарамсыз немесе қате енгізілген.';
      if (upstream.status === 404) message = 'AI моделі табылмады. .env файлындағы MODEL мәнін провайдер қолдайтын модельге ауыстырыңыз.';
      if (upstream.status === 429) message = 'Сұраныс шегі немесе баланс лимиті аяқталды. Біраздан кейін қайталап көріңіз.';
      return res.status(502).json({ error: message });
    }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return res.status(502).json({ error: 'AI бос жауап қайтарды. Қайталап көріңіз.' });
    }
    return res.json({ answer: answer.trim() });
  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(500).json({ error: 'Сервер қатесі. Сервер журналын тексеріңіз.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Mashhur Jusip AI running on port ${PORT}`));
