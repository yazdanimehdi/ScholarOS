import { getSiteConfig } from './config';
import type { ImageShape } from './types';

const shapeClasses: Record<ImageShape, string> = {
  rectangular: '',
  circular: 'rounded-full',
  oval: 'rounded-[40%]',
};

export function getImageShapeClass(): string {
  const shape = getSiteConfig().imageShape ?? 'rectangular';
  return shapeClasses[shape] || '';
}

export function isCircularShape(): boolean {
  return (getSiteConfig().imageShape ?? 'rectangular') === 'circular';
}
