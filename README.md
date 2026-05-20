# AI Telegram News Admin Bot

Ushbu bot ko'rsatilgan RSS manbalaridan (masalan, TechCrunch) yangiliklarni avtomatik ravishda oladi, Google Gemini AI yordamida o'zbek tiliga tahrirlaydi va Telegram kanalga har soatda bittadan post joylaydi.

## ✨ Xususiyatlari
- **Semantik Filter**: Bir xil mavzudagi yangiliklarni mantiqan aniqlaydi va takrorlanishdan saqlaydi.
- **Admin Panel**: Telegram orqali saytlar ro'yxatini va AI uslubini (prompt) boshqarish.
- **Avtomatlashtirish**: `node-cron` yordamida har soatda tekshiruv.
- **AI Tahrir**: Google Gemini 2.0 orqali yuqori sifatli tarjima va tahlil.

## 🚀 O'rnatish

1. Repozitoriyani yuklab oling:
   ```bash
   git clone <repo-url>
   cd <repo-name>
   ```

2. Kerakli kutubxonalarni o'rnating:
   ```bash
   npm install
   ```

3. `.env` faylini yarating va quyidagi ma'lumotlarni kiriting:
   ```env
   TELEGRAM_BOT_TOKEN=Sizning_Bot_Tokeningiz
   CHANNEL_ID=@Sizning_Kanalingiz
   GEMINI_API_KEY=Sizning_Gemini_API_Kalitingiz
   ```

4. Botni ishga tushiring:
   ```bash
   npm start
   ```

## 🛠 Deploy qilish uchun tavsiya
Botni 24/7 ishlashi uchun **PM2** dan foydalanish tavsiya etiladi:
```bash
npm install pm2 -g
pm2 start index.js --name "news-bot"
```

## 📄 Litsenziya
MIT
