import type { SpotPosition, SpotStatus } from '@/models/journal';
import { isOnOrAfterDate } from './trade-values';

function hasSpotBuyDetails(spot: SpotPosition) {
  return Boolean(
    spot.buyDate &&
      Number.isFinite(spot.buyPrice) &&
      spot.buyPrice > 0 &&
      Number.isFinite(spot.quantityBought) &&
      spot.quantityBought > 0,
  );
}

export function getSpotQuantitySold(spot: SpotPosition) {
  return spot.sells.reduce((sum, sell) => sum + sell.quantitySold, 0);
}

export function getSpotRemainingQuantity(spot: SpotPosition) {
  return Math.max(0, spot.quantityBought - getSpotQuantitySold(spot));
}

export function getSpotLifecycleStatus(spot: SpotPosition): SpotStatus {
  if (!hasSpotBuyDetails(spot)) return 'closed';

  const quantitySold = getSpotQuantitySold(spot);
  const remainingQuantity = getSpotRemainingQuantity(spot);

  if (spot.quantityBought > 0 && remainingQuantity <= 0) return 'closed';
  if (quantitySold > 0) return 'partially_sold';
  return 'open';
}

export function isSpotOpen(spot: SpotPosition) {
  return hasSpotBuyDetails(spot) && getSpotLifecycleStatus(spot) !== 'closed';
}

export function wasSpotOpenOnDate(spot: SpotPosition, date: string) {
  if (!isSpotOpenOnOrAfterBuy(spot, date)) return false;

  const fullyClosingSell = spot.sells
    .slice()
    .sort((a, b) => `${a.sellDate} ${a.sellTime ?? ''}`.localeCompare(`${b.sellDate} ${b.sellTime ?? ''}`))
    .find((sell, index, sells) => {
      const quantitySoldThroughSell = sells.slice(0, index + 1).reduce((sum, item) => sum + item.quantitySold, 0);
      return spot.quantityBought > 0 && quantitySoldThroughSell >= spot.quantityBought;
    });

  return !fullyClosingSell || fullyClosingSell.sellDate >= date;
}

function isSpotOpenOnOrAfterBuy(spot: SpotPosition, date: string) {
  return hasSpotBuyDetails(spot) && isOnOrAfterDate(date, spot.buyDate);
}
