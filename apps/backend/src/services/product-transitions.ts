import type { ProductStatus } from '@ebieshop/shared';
import { BadRequestError } from '../errors.js';

const ALLOWED_PRODUCT_TRANSITIONS: Record<ProductStatus, ReadonlyArray<ProductStatus>> = {
  CANDIDATE: ['CURATED', 'DROPPED'],
  CURATED: ['ACTIVE', 'PAUSED', 'DROPPED'],
  ACTIVE: ['PAUSED', 'DROPPED'],
  PAUSED: ['ACTIVE', 'CURATED', 'DROPPED'],
  DROPPED: [],
};

export function assertValidProductTransition(
  current: ProductStatus,
  next: ProductStatus
): void {
  if (current === next) {
    return;
  }
  const allowed = ALLOWED_PRODUCT_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new BadRequestError(
      `Invalid product status transition from ${current} to ${next}`
    );
  }
}
