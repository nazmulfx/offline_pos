/**
 * itemService.ts — Fetch items: online from ERPNext API, offline from IndexedDB
 */
import call from '../lib/call';
import { cacheItems, getCachedItems } from '../db/posDB';

interface FetchItemsOptions {
  search?: string;
  group?: string;
  priceList: string;
  posProfile: string;
  start?: number;
  pageLength?: number;
  isOnline: boolean;
}

export async function fetchItems(opts: FetchItemsOptions): Promise<any[]> {
  const {
    search = '',
    group = '',
    priceList,
    posProfile,
    start = 0,
    pageLength = 40,
    isOnline,
  } = opts;

  if (isOnline) {
    try {
      console.log(`[ItemService] Fetching items from server (start: ${start}, group: "${group || 'All Item Groups'}", search: "${search}")...`);
      const result = await call(
        'erpnext.selling.page.point_of_sale.point_of_sale.get_items',
        {
          start,
          page_length: pageLength,
          price_list: priceList,
          item_group: group || 'All Item Groups',
          pos_profile: posProfile,
          search_term: search,
        }
      );
      const fetched: any[] = result?.items || [];
      if (fetched.length > 0) {
        await cacheItems(fetched);
      }
      return fetched;
    } catch (err) {
      console.warn('[ItemService] API failed, falling back to IndexedDB:', err);
    }
  }

  // Offline fallback
  const cached = await getCachedItems(search, group);
  return cached.slice(start, start + pageLength);
}

export async function fetchItemByBarcode(
  barcode: string,
  priceList: string,
  warehouse: string,
  isOnline: boolean
): Promise<any | null> {
  if (isOnline) {
    try {
      console.log(`[ItemService] Fetching item by barcode "${barcode}" from server...`);
      const result = await call(
        'erpnext.selling.page.point_of_sale.point_of_sale.get_items',
        {
          start: 0,
          page_length: 1,
          price_list: priceList,
          item_group: 'All Item Groups',
          pos_profile: '',
          search_term: barcode,
        }
      );
      return result?.items?.[0] || null;
    } catch {
      /* fall through */
    }
  }
  // Search cached items by barcode
  const cached = await getCachedItems(barcode);
  return cached[0] || null;
}
