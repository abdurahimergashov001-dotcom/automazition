const { Telegraf, Markup } = require('telegraf');
const RSSParser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

// Configuration check
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.GEMINI_API_KEY) {
    console.error('Error: TELEGRAM_BOT_TOKEN or GEMINI_API_KEY missing in .env');
    process.exit(1);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.CHANNEL_ID;
const geminiApiKey = process.env.GEMINI_API_KEY;
const dbPath = './db.json';

// Initialize APIs
const bot = new Telegraf(botToken);
const parser = new RSSParser();
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// State for admin actions
const adminState = {};

// Database logic
function loadDb() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({ 
            processedLinks: [], 
            lastTitles: [], 
            feeds: ["https://techcrunch.com/feed/"],
            prompt: "Siz jurnalistsiz. Yangilikni oʻzbek tiliga tahrirlang.",
            isActive: true,
            adminId: null
        }));
    }
    const db = JSON.parse(fs.readFileSync(dbPath));
    if (!db.lastTitles) db.lastTitles = [];
    return db;
}

function saveDb(db) {
    if (db.lastTitles.length > 30) db.lastTitles = db.lastTitles.slice(-30);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// AI Content Processing & Deduplication
async function processContent(title, content, link, db) {
    try {
        const history = db.lastTitles.length > 0 ? db.lastTitles.join('\n- ') : 'Hech qanday xabarlar yo\'q';
        const fullPrompt = `Siz tahrirchisiz. Kanaldagi oxirgi xabarlar sarlavhalari:\n- ${history}\n\nYangi xabar sarlavhasi: ${title}\n\nTopshiriq:\n1. Agar ushbu yangi xabar mantiqan yuqoridagi xabarlarning biri bilan bir xil bo'lsa yoki o'ta o'xshash bo'lsa, faqat bitta so'z qaytaring: "SKIPPED".\n2. Agar bu yangi bo'lsa, uni quyidagi uslubda o'zbek tiliga o'giring:\n\n${db.prompt}\n\nMatn: ${content.substring(0, 5000)}`;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        let text = response.text();
        
        if (text.trim().toUpperCase().includes('SKIPPED')) return 'SKIPPED';
        
        if (text.includes('[Bu yerga asl havola qoʻyiladi]')) {
            text = text.replace('[Bu yerga asl havola qoʻyiladi]', link);
        } else if (!text.includes(link)) {
            text += `\n🔗 Batafsil: ${link}`;
        }
        
        return text;
    } catch (error) {
        console.error('AI Error:', error.message);
        return null;
    }
}

// Main Logic
async function checkNews() {
    console.log('--- News Check Started ---');
    const db = loadDb();
    if (!db.isActive) return;

    try {
        for (const rssUrl of db.feeds) {
            const feed = await parser.parseURL(rssUrl).catch(() => null);
            if (!feed) continue;

            const items = feed.items.slice(0, 10).reverse(); 

            for (const item of items) {
                if (db.processedLinks.includes(item.link)) continue;

                console.log(`Analyzing: ${item.title}`);
                const formattedPost = await processContent(item.title, item.content || item.contentSnippet, item.link, db);
                
                if (formattedPost === 'SKIPPED') {
                    db.processedLinks.push(item.link);
                    saveDb(db);
                    continue;
                }

                if (formattedPost) {
                    await bot.telegram.sendMessage(chatId, formattedPost, { parse_mode: 'Markdown' }).catch(() => {
                        return bot.telegram.sendMessage(chatId, formattedPost);
                    });
                    
                    db.processedLinks.push(item.link);
                    db.lastTitles.push(item.title);
                    saveDb(db);
                    console.log('✅ Post sent successfully.');
                    return; // ONE POST PER HOUR
                }
            }
        }
    } catch (error) {
        console.error('System Error:', error.message);
    }
}

// Admin Panel
const isAdmin = (ctx, next) => {
    const db = loadDb();
    if (db.adminId === ctx.from.id) return next();
    if (!db.adminId) { db.adminId = ctx.from.id; saveDb(db); return next(); }
    return ctx.reply('Sizda admin huquqi yoʻq.');
};

const showAdminMenu = (ctx) => {
    const db = loadDb();
    const status = db.isActive ? '🟢 Faol' : '🔴 Toʻxtatilgan';
    ctx.reply(`🛠 **Admin Panel**\n\nHolati: ${status}\nJami postlar: ${db.processedLinks.length}`, 
    Markup.inlineKeyboard([
        [Markup.button.callback('📡 Saytlar', 'manage_feeds'), Markup.button.callback('✍️ Prompt', 'edit_prompt')],
        [Markup.button.callback(db.isActive ? '⏸ Toʻxtatish' : '▶️ Ishga tushirish', 'toggle_status')],
        [Markup.button.callback('🔄 Hozir tekshirish', 'manual_check')]
    ]));
};

bot.command('admin', isAdmin, (ctx) => showAdminMenu(ctx));
bot.action('manage_feeds', isAdmin, (ctx) => {
    const db = loadDb();
    let text = '📡 **Tizimdagi saytlar:**\n\n' + db.feeds.map((f, i) => `${i+1}. ${f}`).join('\n');
    ctx.editMessageText(text, Markup.inlineKeyboard([
        [Markup.button.callback('➕ Qoʻshish', 'add_feed'), Markup.button.callback('➖ Oʻchirish', 'remove_feed')],
        [Markup.button.callback('⬅️ Orqaga', 'back_to_menu')]
    ]));
});

bot.action('add_feed', isAdmin, (ctx) => { adminState[ctx.from.id] = 'waiting_for_feed'; ctx.reply('RSS link yuboring:'); });
bot.action('remove_feed', isAdmin, (ctx) => { adminState[ctx.from.id] = 'waiting_for_remove_index'; ctx.reply('Raqamni yuboring:'); });
bot.action('edit_prompt', isAdmin, (ctx) => { adminState[ctx.from.id] = 'waiting_for_prompt'; ctx.reply('Yangi prompt yuboring:'); });
bot.action('toggle_status', isAdmin, (ctx) => { const db = loadDb(); db.isActive = !db.isActive; saveDb(db); showAdminMenu(ctx); });
bot.action('manual_check', isAdmin, async (ctx) => { await checkNews(); showAdminMenu(ctx); });
bot.action('back_to_menu', isAdmin, (ctx) => showAdminMenu(ctx));

bot.on('text', isAdmin, (ctx) => {
    const state = adminState[ctx.from.id];
    const db = loadDb();
    if (state === 'waiting_for_feed' && ctx.message.text.startsWith('http')) {
        db.feeds.push(ctx.message.text); saveDb(db); delete adminState[ctx.from.id]; showAdminMenu(ctx);
    } else if (state === 'waiting_for_remove_index') {
        const i = parseInt(ctx.message.text) - 1;
        if (db.feeds[i]) { db.feeds.splice(i, 1); saveDb(db); delete adminState[ctx.from.id]; showAdminMenu(ctx); }
    } else if (state === 'waiting_for_prompt') {
        db.prompt = ctx.message.text; saveDb(db); delete adminState[ctx.from.id]; showAdminMenu(ctx);
    }
});

// Scheduling
cron.schedule('0 * * * *', () => checkNews());

bot.launch().then(() => console.log('🚀 Bot production rejimida ishga tushdi.'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
