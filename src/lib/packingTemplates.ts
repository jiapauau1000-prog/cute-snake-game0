import type { PackingItem } from '../types';
import { uid } from './storage';

const BASE = ['護照／身分證件', '充電器與行動電源', '常用藥品', '錢包與備用現金'];

const RAINY = ['摺疊傘或雨衣', '防水袋', '快乾衣物'];

const COLD = ['薄外套', '圍巾或帽子', '保暖襪'];

const BEACH = ['泳具', '防曬乳', '拖鞋'];

export function packingTemplateLabels(options?: {
  rainy?: boolean;
  cold?: boolean;
  beachy?: boolean;
}): string[] {
  const labels = [...BASE];
  if (options?.rainy) labels.push(...RAINY);
  if (options?.cold) labels.push(...COLD);
  if (options?.beachy) labels.push(...BEACH);
  return Array.from(new Set(labels));
}

export function mergePackingTemplate(
  existing: PackingItem[],
  labels: string[],
): PackingItem[] {
  const have = new Set(existing.map((item) => item.label.trim().toLowerCase()));
  const extras = labels
    .filter((label) => !have.has(label.trim().toLowerCase()))
    .map((label) => ({ id: uid('pack'), label, done: false }));
  return [...existing, ...extras];
}
