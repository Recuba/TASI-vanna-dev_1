/**
 * Alert API types.
 *
 * Note: For anonymous / SQLite mode, alerts are managed entirely in
 * localStorage via the use-alerts hook. These types are shared between
 * the localStorage implementation and future server-side JWT endpoints.
 */

export interface AlertItem {
  id: string;
  ticker: string;
  alert_type: 'price_above' | 'price_below' | 'volume_spike';
  threshold_value: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AlertCreate {
  ticker: string;
  alert_type: 'price_above' | 'price_below' | 'volume_spike';
  threshold_value: number;
}
