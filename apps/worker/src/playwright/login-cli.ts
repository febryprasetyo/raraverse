import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';

type SupportedLoginPlatform = 'shopee' | 'tiktok';

const LOGIN_URLS: Record<SupportedLoginPlatform, string> = {
  shopee: 'https://creator.shopee.co.id/',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload',
};

export async function runInteractiveLogin(platform: SupportedLoginPlatform): Promise<void> {
  const storagePath = resolve(process.cwd(), `storageState.${platform}.json`);
  const playwrightModuleName = 'playwright';
  const pw = (await import(playwrightModuleName)) as {
    chromium: {
      launch: (opts: { headless: boolean }) => Promise<{
        newContext: (opts: {
          viewport: { width: number; height: number };
        }) => Promise<{
          newPage: () => Promise<{ goto: (url: string) => Promise<void> }>;
          storageState: (opts: { path: string }) => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
    };
  };

  const browser = await pw.chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();
    await page.goto(LOGIN_URLS[platform]);

    const rl = createInterface({ input, output });
    await rl.question(
      `\n[${platform.toUpperCase()}] Silakan login manual di browser (OTP/QR/2FA).\nTekan ENTER setelah masuk ke dashboard studio untuk menyimpan sesi...`
    );
    rl.close();

    await context.storageState({ path: storagePath });
    console.log(`Sesi tersimpan ke ${storagePath}`);
  } finally {
    await browser.close();
  }
}

const isCliEntry = process.argv[1]?.includes('login-cli');
if (isCliEntry) {
  const target = process.argv[2] === 'tiktok' ? 'tiktok' : 'shopee';
  void runInteractiveLogin(target).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
