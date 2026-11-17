import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MetaWebhookPayload, Product } from '@ebieshop/shared';
import type { IDmLogRepository, IProductRepository } from '../adapters/contracts.js';
import type { IMetaGraphClient } from '../adapters/meta-graph-client.js';

const PUBLIC_REPLY_TEMPLATES = [
  'Cek DM ya kak, link produk resminya sudah meluncur! ✨',
  'Sudah dikirim ke kotak masuk kakak ya, silakan cek DM! 📩',
  'Link promo produk sudah kami kirim lewat DM, yuk dicek kak! 💛',
  'Halo kak! Detail produk & link belinya sudah masuk DM ya! 🙌',
  'Siap kak, cek DM sekarang ya—link resmi sudah terkirim! 🚀',
] as const;

export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Matches a product triggerKeyword case-insensitively and tolerates spaces
 * (e.g., "mau dong rak 01 kak" -> matches "RAK01").
 */
export function matchTriggerKeyword(
  commentText: string,
  products: Product[]
): Product | null {
  const collapsed = commentText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!collapsed) {
    return null;
  }
  for (const product of products) {
    if (product.status === 'DROPPED') {
      continue;
    }
    const kw = product.triggerKeyword.toUpperCase();
    if (collapsed.includes(kw)) {
      return product;
    }
  }
  return null;
}

export function pickPublicReplyTemplate(seed: number): string {
  return PUBLIC_REPLY_TEMPLATES[Math.abs(seed) % PUBLIC_REPLY_TEMPLATES.length]!;
}

export interface MetaAutoDmProcessorOptions {
  products: IProductRepository;
  dmLogs: IDmLogRepository;
  metaClient: IMetaGraphClient;
  ownAccountIds?: string[];
  igUserId?: string;
}

export class MetaAutoDmProcessor {
  private readonly ownAccountIds: Set<string>;
  private readonly igUserId: string;
  private replyCounter = 0;

  constructor(private readonly options: MetaAutoDmProcessorOptions) {
    this.ownAccountIds = new Set(options.ownAccountIds ?? []);
    this.igUserId = options.igUserId ?? 'me';
  }

  async processWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
    const products = await this.options.products.listProducts();
    const platform = payload.object === 'instagram' ? 'IG_REELS' : 'FB_REELS';

    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'comments') {
          continue;
        }
        const comment = change.value;
        if (this.ownAccountIds.has(comment.from.id)) {
          continue;
        }

        const existing = await this.options.dmLogs.findByCommentId(comment.id);
        if (existing) {
          continue;
        }

        const matchedProduct = matchTriggerKeyword(comment.text, products);
        if (!matchedProduct) {
          await this.options.dmLogs.createDmLog({
            productId: null,
            platform,
            mediaId: comment.media?.id ?? entry.id,
            commentId: comment.id,
            senderId: comment.from.id,
            senderUsername: comment.from.username ?? null,
            commentText: comment.text,
            matchedKeyword: null,
            publicReplySent: false,
            dmSent: false,
            status: 'SKIPPED_NO_KEYWORD',
          });
          continue;
        }

        const shortlink =
          matchedProduct.affiliateUrls.shopeeShortlink ??
          matchedProduct.affiliateUrls.biolinkAnchorUrl ??
          matchedProduct.affiliateUrls.tokopediaShortlink ??
          'https://desty.page/ebieshop';

        const publicReply = pickPublicReplyTemplate(this.replyCounter);
        this.replyCounter += 1;

        const dmText = `Halo kak! Ini link resmi ${matchedProduct.name} (${matchedProduct.triggerKeyword}): ${shortlink}`;

        let publicReplySent = false;
        let dmSent = false;
        let status: 'SENT' | 'FAILED' = 'SENT';

        try {
          await this.options.metaClient.replyToComment({
            commentId: comment.id,
            message: publicReply,
          });
          publicReplySent = true;

          await this.options.metaClient.sendPrivateReplyDm({
            igUserId: this.igUserId,
            commentId: comment.id,
            message: dmText,
          });
          dmSent = true;
        } catch {
          status = 'FAILED';
        }

        await this.options.dmLogs.createDmLog({
          productId: matchedProduct.id,
          platform,
          mediaId: comment.media?.id ?? entry.id,
          commentId: comment.id,
          senderId: comment.from.id,
          senderUsername: comment.from.username ?? null,
          commentText: comment.text,
          matchedKeyword: matchedProduct.triggerKeyword,
          publicReplySent,
          dmSent,
          status,
        });
      }
    }
  }
}
