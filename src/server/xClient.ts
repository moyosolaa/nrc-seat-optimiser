// X (Twitter) posting client. Free tier allows posting (write) — only reading mentions
// costs money, which is why this bot is post-only. OAuth 1.0a user context: 4 keys from
// the X developer portal, supplied as env/secrets. Returns null when keys are absent, so
// the bot falls back to a safe dry mode (log instead of post).

import { TwitterApi } from 'twitter-api-v2';

export interface Poster {
  post(text: string): Promise<void>;
}

export function makeXClient(): Poster | null {
  const appKey = process.env.X_APP_KEY;
  const appSecret = process.env.X_APP_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) return null;

  const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  return {
    async post(text: string): Promise<void> {
      await client.v2.tweet(text);
    },
  };
}
