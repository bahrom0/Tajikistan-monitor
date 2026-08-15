import locationsDataset from './geography/locations.json';

export type LocationType = 'region' | 'district' | 'city' | 'town';

export interface CanonicalLocation {
  id: string;
  type: LocationType;
  name_ru: string;
  name_tg: string;
  parent_id: string | null;
  longitude: number | null;
  latitude: number | null;
  official_source_url: string;
  coordinate_source_url: string;
  dataset_date: string;
}

export const locations = locationsDataset.locations as CanonicalLocation[];

export const cities = locations
  .filter((location): location is CanonicalLocation & { longitude: number; latitude: number } => (
    location.type === 'city' && location.longitude !== null && location.latitude !== null
  ));

