/**
 * Friendly display names for Star Citizen shop identifiers.
 * Format: "Location \u2014 Shop Name"
 *
 * The known list is the authority. The fallback parser handles identifiers
 * not yet in the list (e.g. new shops added in future game patches).
 */

/** @type {Record<string, string>} */
const SHOP_NAMES = {
  Inv_Admin_Admin_Truckstop_Base_D:      'Lagrange Outpost \u2014 Admin Office',
  Inv_Admin_Area18:                       'Area 18 \u2014 Admin Office',
  Inv_Admin_Grimhex:                      'GrimHEX \u2014 Admin Office',
  Inv_Admin_Hurston_Lorville:             'Lorville \u2014 Admin Office',
  Inv_Admin_Levski:                       'Levski \u2014 Admin Office',
  Inv_Admin_NewBabbage:                   'New Babbage \u2014 Admin Office',
  Inv_Admin_PortOlisar:                   'Port Olisar \u2014 Admin Office',
  Inv_Aparelli_NewBabbage:                'New Babbage \u2014 Aparelli',
  Inv_AstroArmada_Area18:                 'Area 18 \u2014 Astro Armada',
  Inv_BarGeneric_Food_RestStop:           'Rest Stop \u2014 Generic Bar',
  Inv_BurritoBar_Food_RestStop:           'Rest Stop \u2014 Burrito Bar',
  Inv_CafeMusain_Food_Levski:             'Levski \u2014 Caf\u00e9 Musain',
  Inv_CasabaOutlet_Area18:                'Area 18 \u2014 Casaba Outlet',
  Inv_CasabaOutlet_Food_Area18:           'Area 18 \u2014 Casaba Outlet',
  Inv_CasabaOutlet_Food_PortOlisar:       'Port Olisar \u2014 Casaba Outlet',
  Inv_CasabaOutlet_Food_RestStop:         'Rest Stop \u2014 Casaba Outlet',
  Inv_CasabaOutlet_PortOlisar:            'Port Olisar \u2014 Casaba Outlet',
  Inv_CasabaOutlet_lt_a_small_base_a:     'Small Outpost \u2014 Casaba Outlet',
  Inv_CenterMass_NewBabbage:              'New Babbage \u2014 CenterMass',
  Inv_ClothingStand_Levski:               'Levski \u2014 Clothing Stand',
  Inv_CoffeeToGo_Food_Area18:             'Area 18 \u2014 Coffee To Go',
  Inv_CommEx_Transfers_Lorville:          'Lorville \u2014 CommEx',
  Inv_ConscientiousObjects_Levski:        'Levski \u2014 Conscientious Objects',
  Inv_Cordrys_Levski:                     "Levski \u2014 Cordry's",
  Inv_CubbyBlast_A18:                     'Area 18 \u2014 Cubby Blast',
  Inv_CubbyBlast_Area18:                  'Area 18 \u2014 Cubby Blast',
  Inv_CubbyBlast_Food_Area18:             'Area 18 \u2014 Cubby Blast',
  Inv_DumpersDepot_Area18:                "Area 18 \u2014 Dumper's Depot",
  Inv_DumpersDepot_Grimhex:               "GrimHEX \u2014 Dumper's Depot",
  Inv_DumpersDepot_Levski:                "Levski \u2014 Dumper's Depot",
  Inv_DumpersDepot_PortOlisar:            "Port Olisar \u2014 Dumper's Depot",
  Inv_Ellroys_Food_NewBabbage:            "New Babbage \u2014 Ellroy's",
  Inv_Ellroys_Food_RestStop:              "Rest Stop \u2014 Ellroy's",
  Inv_GLoc_Food_Area18:                   'Area 18 \u2014 G-Loc Bar',
  Inv_GadgetStand_Levski:                 'Levski \u2014 Gadget Stand',
  Inv_GarciaGreens_Food_NewBabbage:       "New Babbage \u2014 Garcia's Greens",
  Inv_GarrityDefense_PortOlisar:          'Port Olisar \u2014 Garrity Defense',
  Inv_Generic_Armor_Reststop_Small_a:     'Small Rest Stop \u2014 Armor Shop',
  Inv_Generic_Clothing_Reststop_Small_a:  'Small Rest Stop \u2014 Clothing Shop',
  Inv_Generic_ShipWeap_Reststop_Small_a:  'Small Rest Stop \u2014 Ship Weapons',
  Inv_HotDogBar_Food_RestStop:            'Rest Stop \u2014 Hot Dog Bar',
  Inv_JuiceBar_Food_RestStop:             'Rest Stop \u2014 Juice Bar',
  Inv_KCTrending_GrimHex:                 'GrimHEX \u2014 KC Trending',
  Inv_LandingServices_A18:                'Area 18 \u2014 Landing Services',
  Inv_LandingServices_GrimHex:            'GrimHEX \u2014 Landing Services',
  Inv_LandingServices_Levski:             'Levski \u2014 Landing Services',
  Inv_LandingServices_Lorville:           'Lorville \u2014 Landing Services',
  Inv_LandingServices_PortOlisar:         'Port Olisar \u2014 Landing Services',
  Inv_LandingServices_rs_full_0001:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0002:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0003:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0005:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0006:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0007:       'Lagrange Station \u2014 Landing Services',
  Inv_LandingServices_rs_full_0008:       'Lagrange Station \u2014 Landing Services',
  Inv_LiveFireWeapons_Food_PortOlisar:    'Port Olisar \u2014 Live Fire Weapons',
  Inv_LiveFireWeapons_PortOlisar:         'Port Olisar \u2014 Live Fire Weapons',
  Inv_LiveFireWeapons_lt_a_small_base_b:  'Small Outpost \u2014 Live Fire Weapons',
  Inv_MVBar_Food_Lorville:                'Lorville \u2014 MV Bar',
  Inv_Market_Bar_Food_Levski:             'Levski \u2014 The Market Bar',
  Inv_Mining_Area18:                      'Area 18 \u2014 Mining Shop',
  Inv_Mining_Grimhex:                     'GrimHEX \u2014 Mining Shop',
  Inv_Mining_Levski:                      'Levski \u2014 Mining Shop',
  Inv_Mining_Lorville:                    'Lorville \u2014 Mining Shop',
  Inv_Mining_NewBabbage:                  'New Babbage \u2014 Mining Shop',
  Inv_Mining_PortOlisar:                  'Port Olisar \u2014 Mining Shop',
  Inv_NewDeal_Lorville:                   'Lorville \u2014 New Deal',
  Inv_NoodleBar_Food_Lorville:            'Lorville \u2014 Noodle Bar',
  Inv_NoodleBar_Food_RestStop:            'Rest Stop \u2014 Noodle Bar',
  Inv_Old38_Food_GrimHEX:                 'GrimHEX \u2014 Old 38',
  Inv_OmegaPro_NewBabbage:                'New Babbage \u2014 Omega Pro',
  Inv_PizzaBar_Food_RestStop:             'Rest Stop \u2014 Pizza Bar',
  Inv_PlatinumBay_Truckstop:              'Lagrange Outpost \u2014 Platinum Bay',
  Inv_RegalLuxuryRentals_NewBabbage:      'New Babbage \u2014 Regal Luxury Rentals',
  Inv_ShipWeapon_HDShowcase_Lorville:     'Lorville \u2014 Hurston Dynamics Showcase',
  Inv_ShipWeapons_Centermass_Area18:      'Area 18 \u2014 CenterMass',
  Inv_ShubinInterstellar_NewBabbage:      'New Babbage \u2014 Shubin Interstellar',
  Inv_SkuttersFood_Grimhex:               'GrimHEX \u2014 Skutters',
  Inv_Skutters_Grimhex:                   'GrimHEX \u2014 Skutters',
  Inv_TammanyAndSons_Food_Lorville:       'Lorville \u2014 Tammany & Sons',
  Inv_TammanyAndSons_Lorville:            'Lorville \u2014 Tammany & Sons',
  Inv_TeachsShipShop_Levski:              "Levski \u2014 Teach's Ship Shop",
  Inv_Technotic_Grimhex:                  'GrimHEX \u2014 Technotic',
  Inv_Twyns_Food_NewBabbage:              "New Babbage \u2014 Twyn's",
  Inv_Wallys_Food_NewBabbage:             "New Babbage \u2014 Wally's",
  Inv_Whammers_NewBabbage:                "New Babbage \u2014 Whammer's",
  Temp_Outpost_ShopInventory:             'Outpost Shop',
}

/**
 * Location token patterns. Checked against the end of the stripped identifier.
 * Ordered most-specific first so longer suffixes match before shorter ones.
 * @type {Array<[RegExp, string]>}
 */
const LOCATION_PATTERNS = [
  [/_rs_full_\d+$/i,           'Lagrange Station'],
  [/_lt_a_small_base_[ab]$/i,  'Small Outpost'],
  [/_Reststop_Small_a$/i,      'Small Rest Stop'],
  [/_Admin_Truckstop_Base_D$/i,'Lagrange Outpost'],
  [/_Truckstop$/i,             'Lagrange Outpost'],
  [/_Hurston_Lorville$/i,      'Lorville'],
  [/_Area18$/i,                'Area 18'],
  [/_A18$/i,                   'Area 18'],
  [/_GrimHEX$/i,               'GrimHEX'],
  [/_GrimHex$/i,               'GrimHEX'],
  [/_Grimhex$/i,               'GrimHEX'],
  [/_Lorville$/i,              'Lorville'],
  [/_Levski$/i,                'Levski'],
  [/_NewBabbage$/i,            'New Babbage'],
  [/_PortOlisar$/i,            'Port Olisar'],
  [/_RestStop$/i,              'Rest Stop'],
]

/**
 * Convert a PascalCase/underscore shop segment to readable words.
 * e.g. "DumpersDepot" → "Dumpers Depot", "ShipWeap" → "Ship Weap"
 * @param {string} s
 * @returns {string}
 */
function toWords(s) {
  return s
    .replace(/_+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

/**
 * Return a human-readable shop name for a raw DataCore shop identifier.
 * Falls back to a best-effort parser for identifiers not in the known list.
 *
 * @param {string|null|undefined} raw - e.g. "Inv_DumpersDepot_Area18"
 * @returns {string} e.g. "Area 18 \u2014 Dumper's Depot"
 */
export function friendlyShopName(raw) {
  if (!raw) return '?'

  // Known list is the authority
  if (SHOP_NAMES[raw]) return SHOP_NAMES[raw]

  // Fallback parser — best-effort for unknown future identifiers
  let s = raw.replace(/^Inv_|^Temp_/, '')

  // Strip _Food_ middleware segment (food variant of the same shop)
  s = s.replace(/_Food_/i, '_')

  // Extract location suffix
  let location = null
  for (const [pattern, loc] of LOCATION_PATTERNS) {
    if (pattern.test(s)) {
      s = s.replace(pattern, '')
      location = loc
      break
    }
  }

  const shopName = toWords(s)
  if (location && shopName) return `${location} \u2014 ${shopName}`
  return shopName || raw
}
