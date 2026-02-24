// --- Cloudflare Bindings ---

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  FLEETYARDS_BASE_URL: string;
  SC_WIKI_ENABLED: string;
  SC_WIKI_RATE_LIMIT: string;
  SC_WIKI_BURST: string;
  RSI_API_ENABLED: string;
  RSI_BASE_URL: string;
  RSI_RATE_LIMIT: string;
  SCUNPACKED_REPO: string;
  SCUNPACKED_BRANCH: string;
  ENVIRONMENT?: string;
  ENCRYPTION_KEY?: string;
  API_TOKEN?: string;
  GITHUB_TOKEN?: string;
  LLM_DEFAULT_MODEL?: string;
  // Better Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // OAuth providers
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    user: {
      id: string;
      name: string;
      email: string;
      role?: string | null;
      image?: string | null;
      banned?: boolean | null;
      banReason?: string | null;
      banExpires?: Date | null;
    } | null;
    session: { id: string; userId: string; expiresAt: Date; impersonatedBy?: string | null } | null;
  };
};

// --- Lookup Types ---

export interface VehicleType {
  id: number;
  key: string;
  label: string;
}

export interface InsuranceType {
  id: number;
  key: string;
  label: string;
  duration_months: number | null;
  is_lifetime: boolean;
}

export interface SyncSource {
  id: number;
  key: string;
  label: string;
}

export interface ProductionStatus {
  id: number;
  key: string;
  label: string;
}

// --- Core Reference Data ---

export interface Manufacturer {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  code?: string;
  known_for?: string;
  description?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface GameVersion {
  id: number;
  uuid: string;
  code: string;
  channel?: string;
  is_default: boolean;
  released_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: number;
  uuid?: string;
  slug: string;
  name: string;
  class_name?: string;
  manufacturer_id?: number;
  vehicle_type_id?: number;
  production_status_id?: number;
  size?: number;
  size_label?: string;
  focus?: string;
  classification?: string;
  description?: string;
  length?: number;
  beam?: number;
  height?: number;
  mass?: number;
  cargo?: number;
  vehicle_inventory?: number;
  crew_min?: number;
  crew_max?: number;
  speed_scm?: number;
  speed_max?: number;
  health?: number;
  pledge_price?: number;
  price_auec?: number;
  on_sale?: boolean;
  image_url?: string;
  image_url_small?: string;
  image_url_medium?: string;
  image_url_large?: string;
  pledge_url?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
  // Joined fields (populated via query, not stored)
  manufacturer_name?: string;
  manufacturer_code?: string;
  production_status?: string;
}

export interface Port {
  id: number;
  uuid: string;
  vehicle_id: number;
  parent_port_id?: number;
  name: string;
  position?: string;
  category_label?: string;
  size_min?: number;
  size_max?: number;
  port_type?: string;
  port_subtype?: string;
  equipped_item_uuid?: string;
  editable: boolean;
  health?: number;
  created_at: string;
}

export interface Component {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  type: string;
  sub_type?: string;
  size?: number;
  grade?: string;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FPSWeapon {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  sub_type?: string;
  size?: number;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FPSArmour {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  sub_type?: string;
  size?: number;
  grade?: string;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FPSAttachment {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  sub_type?: string;
  size?: number;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FPSAmmo {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  sub_type?: string;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FPSUtility {
  id: number;
  uuid: string;
  name: string;
  slug?: string;
  class_name?: string;
  manufacturer_id?: number;
  sub_type?: string;
  description?: string;
  game_version_id?: number;
  created_at: string;
  updated_at: string;
}

export interface PaintVehicle {
  id: number;
  name: string;
  slug: string;
}

export interface Paint {
  id: number;
  uuid?: string;
  name: string;
  slug?: string;
  class_name?: string;
  description?: string;
  image_url?: string;
  image_url_small?: string;
  image_url_medium?: string;
  image_url_large?: string;
  created_at: string;
  updated_at: string;
  vehicles: PaintVehicle[];
}

export interface VehicleLoaner {
  vehicle_id: number;
  loaner_id: number;
}

// --- User Data ---

export interface User {
  id: number;
  username: string;
  handle?: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface UserFleetEntry {
  id: number;
  user_id: number;
  vehicle_id: number;
  insurance_type_id?: number;
  warbond: boolean;
  is_loaner: boolean;
  pledge_id?: string;
  pledge_name?: string;
  pledge_cost?: string;
  pledge_date?: string;
  custom_name?: string;
  equipped_paint_id?: number;
  imported_at: string;
  // Joined fields from reference tables
  vehicle_name?: string;
  vehicle_slug?: string;
  image_url?: string;
  manufacturer_name?: string;
  manufacturer_code?: string;
  insurance_label?: string;
  duration_months?: number;
  is_lifetime?: boolean;
  paint_name?: string;
  focus?: string;
  size_label?: string;
  cargo?: number;
  crew_min?: number;
  crew_max?: number;
  pledge_price?: number;
  production_status?: string;
  speed_scm?: number;
  classification?: string;
}

export interface UserPaint {
  id: number;
  user_id: number;
  paint_id: number;
}

export interface UserLLMConfig {
  id: number;
  user_id: number;
  provider: string;
  encrypted_api_key: string;
  model?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSetting {
  id: number;
  user_id: number;
  key: string;
  value: string;
}

// --- Sync & Audit ---

export interface SyncHistory {
  id: number;
  source_id: number;
  endpoint?: string;
  status: string;
  record_count: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
  // Joined field
  source_label?: string;
}

export interface AIAnalysis {
  id: number;
  user_id: number;
  created_at: string;
  provider: string;
  model: string;
  vehicle_count: number;
  analysis: string;
}

// --- Organisation / RSI Types ---

export type OrgVisibility = 'public' | 'org' | 'officers' | 'private';

export interface OrgFleetEntry extends UserFleetEntry {
  org_visibility: OrgVisibility;
  available_for_ops: boolean;
  owner_name?: string;
}

export interface OrgMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
}

export interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  rsiSid?: string | null;
  rsiUrl?: string | null;
  homepage?: string | null;
  discord?: string | null;
  twitch?: string | null;
  youtube?: string | null;
  createdAt: string;
  memberCount?: number;
}

export interface StoredRsiProfile {
  user_id: string;
  handle: string;
  display_name: string | null;
  citizen_record: string | null;
  enlisted_at: string | null;
  avatar_url: string | null;
  main_org_slug: string | null;
  orgs_json: string;  // JSON: RsiOrg[]
  fetched_at: string;
}

// --- Import Types ---

export interface HangarXplorEntry {
  unidentified?: string;
  ship_code: string;
  ship_name?: string;
  manufacturer_code: string;
  manufacturer_name: string;
  lookup?: string;
  lti: boolean;
  insurance?: string;
  name: string;
  warbond: boolean;
  entity_type: string;
  pledge_id: string;
  pledge_name: string;
  pledge_date: string;
  pledge_cost: string;
}

// --- Analysis Types ---

export interface FleetAnalysis {
  overview: FleetOverview;
  size_distribution: Record<string, number>;
  role_categories: Record<string, string[]>;
  gap_analysis: GapItem[];
  redundancies: RedundancyGroup[];
  insurance_summary: InsuranceSummary;
}

export interface FleetOverview {
  total_vehicles: number;
  flight_ready: number;
  in_concept: number;
  total_cargo: number;
  total_pledge_value: number;
  min_crew: number;
  max_crew: number;
  lti_count: number;
  non_lti_count: number;
}

export interface GapItem {
  role: string;
  priority: string;
  description: string;
  suggestions: string[];
}

export interface RedundancyGroup {
  role: string;
  ships: string[];
  notes: string;
}

export interface InsuranceSummary {
  lti_ships: InsuranceEntry[];
  non_lti_ships: InsuranceEntry[];
  unknown_ships: InsuranceEntry[];
}

export interface InsuranceEntry {
  ship_name: string;
  custom_name?: string;
  pledge_cost?: string;
  pledge_name?: string;
  pledge_date?: string;
  insurance_label?: string;
  duration_months?: number;
  is_lifetime: boolean;
  warbond: boolean;
}
