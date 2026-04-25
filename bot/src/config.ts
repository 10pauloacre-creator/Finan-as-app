import * as dotenv from 'dotenv';
dotenv.config();

export const APP_URL    = process.env.APP_URL    || 'http://localhost:3000';
export const BOT_SECRET = process.env.BOT_SECRET || 'bot-secret-local';
