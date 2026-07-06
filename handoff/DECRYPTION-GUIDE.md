# Encrypted Secrets — Decryption Instructions

## Decryption Key (give this to the next agent separately)

```
PMT-handoff-2024-07-Z!
```

## What's Inside `encrypted-secrets.json`

- Polymarket CLOB V2 API credentials (apiKey, secret, passphrase)
- GitHub personal access token (dustindog101)
- Vercel deployment token
- Railway deployment token
- Webshare proxy credentials (username, password)
- All 10 proxy addresses with ports, countries, cities
- Vercel project name and production URL

## How to Decrypt (Node.js)

```javascript
const crypto = require('crypto');
const fs = require('fs');

const passphrase = 'PMT-handoff-2024-07-Z!';
const payload = JSON.parse(fs.readFileSync('handoff/encrypted-secrets.json', 'utf8'));

const salt = Buffer.from(payload.salt, 'hex');
const iv = Buffer.from(payload.iv, 'hex');
const authTag = Buffer.from(payload.authTag, 'hex');
const encrypted = Buffer.from(payload.encrypted, 'hex');

const key = crypto.scryptSync(passphrase, salt, 32);

const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);

let decrypted = decipher.update(encrypted, undefined, 'utf8');
decrypted += decipher.final('utf8');

const secrets = JSON.parse(decrypted);
console.log('POLY_API_KEY:', secrets.POLY_API_KEY);
console.log('GITHUB_TOKEN:', secrets.GITHUB_TOKEN);
// etc.
```

## Security Notes

- `encrypted-secrets.json` is committed to the repo but is encrypted with AES-256-GCM
- The decryption key is NOT in the repo — it's given to the agent/user separately
- The Polymarket API credentials are ONLY used server-side (Next.js API routes, never sent to the browser)
- The `.env.local` file (which has plain-text creds) is in `.gitignore` and never committed