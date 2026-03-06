#!/usr/bin/env python3
"""
Extract contract requirements from Star Citizen game data (DataCore).

Reads thecollector_*.json contract templates and the thecollector.json generator
to produce a JSON mapping of contract_key -> requirements[].

Usage:
    python extract_contract_requirements.py <datacore_path> [--output requirements.json]

Example:
    python extract_contract_requirements.py "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11377160"
"""

import json
import os
import sys
import glob
import re
from pathlib import Path

# Map internal entity IDs to human-readable item names
ITEM_NAMES = {
    "carryable_1h_cy_banu_favour_wikelo": "Wikelo Favor",
    "carryable_1h_cy_banu_favour_wikelo_special": "Polaris Bit",
    "harvestable_mineral_1h_carinitepure": "Caranite (Pure)",
    "harvestable_mineral_1h_carinite": "Caranite",
    "harvestable_trophy_1h_vlkadultfang_irradiated": "Irradiated Valakkar Fang (Adult)",
    "harvestable_trophy_1h_vlkjuvenilefang_irradiated": "Irradiated Valakkar Fang (Juvenile)",
    "harvestable_trophy_1h_vlkjuvenilefang": "Valakkar Fang (Juvenile)",
    "harvestable_trophy_1h_kopionhorn_irradiated": "Irradiated Kopion Horn",
    "harvestable_trophy_1h_kopionhorn_tundra": "Tundra Kopion Horn",
    "harvestable_ore_1h_saldyniumore": "Saldynium (Ore)",
    "harvestable_ore_1h_jacliumore": "Jaclium (Ore)",
    "carryable_1h_cy_physical_currency_scrip_merc_1": "MG Scrip",
    "carryable_1h_cy_physical_currency_scrip_council_1": "Council Scrip",
    "carryable_1h_cy_advocacy_badge": "Advocacy Badge (Replica)",
    "carryable_1h_cy_medal_1_pristine_a": "UNE Unification War Medal (Pristine)",
    "carryable_1h_cy_medal_1_pristine_b": "UEE 6th Platoon Medal (Pristine)",
    "carryable_1h_cy_medal_1_pristine_c": "Tevarin War Service Marker (Pristine)",
    "carryable_1h_cy_medal_1_pristine_d": "Govt Cartography Medal (Pristine)",
    "fps_consumable_harddrive_delving_hardened_asd_red": "ASD Secure Drive",
    "carryable_1h_sq_pyro_serverblade_5": "ASD Server Blade",
    "basl_combat_light_helmet_02_01_01": "Ace Interceptor Helmet",
    "carryable_2h_fl_vlk_pearl_irradiated_super_01": "Irradiated Valakkar Pearl (AAA)",
    "carryable_2h_fl_vlk_pearl_irradiated_high_02": "Irradiated Valakkar Pearl (AA)",
    "carryable_tbo_creature_trophy_vlkapexfang_irradiated": "Irradiated Valakkar Fang (Apex)",
    "harvestable_trophy_1h_quasigrazeregg_grassland": "Grassland Quasi Grazer Egg",
    # ASD Reward items (delving loot)
    "carryable_tbo_asdreward_rgl1": "ASD Reward (RGL Tier 1)",
    "carryable_tbo_asdreward_rgl2": "ASD Reward (RGL Tier 2)",
    "carryable_tbo_asdreward_rgl3": "ASD Reward (RGL Tier 3)",
    "carryable_tbo_asdreward_xtl1": "ASD Reward (XTL Tier 1)",
    "carryable_tbo_asdreward_xtl2": "ASD Reward (XTL Tier 2)",
    "carryable_tbo_asdreward_xtl3": "ASD Reward (XTL Tier 3)",
    "carryable_tbo_asdreward_pwl1": "ASD Reward (PWL Tier 1)",
    "carryable_tbo_asdreward_pwl2": "ASD Reward (PWL Tier 2)",
    "carryable_tbo_asdreward_pwl3": "ASD Reward (PWL Tier 3)",
    # Drinks
    "drink_can_fizzz_01_peach_a": "Fizzz Peach",
    "drink_bottle_vestal_01_a": "Vestal Water",
    # Weapons (these are rewards, not requirements - but appear in hauling orders)
    "volt_lmg_energy_01": "Volt LMG",
    "volt_sniper_energy_01": "Volt Sniper",
    "volt_shotgun_energy_01": "Volt Shotgun",
    "volt_smg_energy_01": "Volt SMG",
    "ksar_pistol_ballistic_01": "Coda Pistol",
    "ksar_rifle_energy_01": "Karna Rifle",
    "gmni_rifle_ballistic_01": "S71 Rifle",
    # Armor pieces
    "qrt_specialist_heavy_core_01_01_01": "QRT Heavy Core Armor",
    "qrt_specialist_heavy_helmet_01_01_01": "QRT Heavy Helmet",
    "qrt_specialist_heavy_arms_01_01_01": "QRT Heavy Arms",
    "qrt_specialist_heavy_legs_01_01_01": "QRT Heavy Legs",
    "kap_combat_light_arms_02_01_01": "Kappa Light Arms",
    "kap_combat_light_core_02_01_01": "Kappa Light Core",
    "kap_combat_light_helmet_02_01_01": "Kappa Light Helmet",
    "kap_combat_light_legs_02_01_01": "Kappa Light Legs",
    "cds_combat_light_backpack_01_03_01": "CDS Light Backpack",
    "omc_utility_heavy_core_01_01_16": "OMC Heavy Core",
    "omc_utility_heavy_arms_01_01_16": "OMC Heavy Arms",
    "omc_utility_heavy_legs_01_01_16": "OMC Heavy Legs",
    "omc_utility_heavy_helmet_01_01_16": "OMC Heavy Helmet",
    "clda_env_heavy_backpack_01_02_16": "CLDA Heavy Backpack",
    "grin_utility_medium_arms_02_01_01": "Greycat Medium Arms",
    "grin_utility_medium_legs_02_01_01": "Greycat Medium Legs",
    "grin_utility_medium_backpack_02_01_01": "Greycat Medium Backpack",
    "grin_utility_medium_core_02_01_01": "Greycat Medium Core",
    "fta_medium_helmet_01_01_05": "FTA Medium Helmet",
    "clda_env_armor_heavy_helmet_01_01_01": "CLDA Explorer Heavy Helmet",
    "clda_env_armor_heavy_suit_01_01_01": "CLDA Explorer Heavy Suit",
    "rsi_explorer_armor_light_core_01_01_01": "RSI Explorer Light Core",
    "rsi_explorer_armor_light_helmet_01_01_01": "RSI Explorer Light Helmet",
    "rsi_explorer_armor_light_legs_01_01_01": "RSI Explorer Light Legs",
    "rsi_explorer_armor_light_arms_01_01_01": "RSI Explorer Light Arms",
    "syfb_flightsuit_helmet_01_01_01": "Xanthule Flightsuit Helmet",
    "syfb_flightsuit_suit_01_01_01": "Xanthule Flightsuit",
    "cds_armor_heavy_core_01_01_01": "CDS Heavy Core",
    "cds_armor_heavy_arms_01_01_01": "CDS Heavy Arms",
    "cds_armor_heavy_legs_01_01_01": "CDS Heavy Legs",
    "cds_armor_heavy_helmet_01_01_01": "CDS Heavy Helmet",
    # Vehicles (appear as requirements in some contracts)
    "argo_atls": "ARGO ATLS",
    "argo_atls_geo": "ARGO ATLS (Geo)",
    "argo_atls_ikti": "ARGO ATLS (Ikti)",
    "mxox_neutroncannon_s1": "NN-13 Neutron Cannon",
    "volt_rifle_energy_01": "Parallax Energy Assault Rifle",
}

# Localization key -> title mapping (extracted from global.ini)
TITLE_MAP = {
    "@TheCollector_Recipes_Title_SandArmour": "Armor with horn and string",
    "@TheCollector_Recipes_Title_KopSkull": "Fun Kopion Skull Gun",
    "@TheCollector_Recipes_Title_KopTooth": "Fun Kopion Tooth Gun",
    "@TheCollector_Recipes_Title_MiltSkull": "Fun Military Skull Gun",
    "@TheCollector_Recipes_Title_MiltTooth": "Fun Military Tooth Gun",
    "@TheCollector_Menu_Title_JungleArm": "Want armor look like tree?",
    "@TheCollector_Menu_Title_DesertArm": "Look at desert but don't see you",
    "@TheCollector_Menu_Title_NavyArm": "Make space navy armor",
    "@TheCollector_Menu_Title_NavyVolt": "Volt gun more Navy-like",
    "@TheCollector_Menu_Title_JungleVolt": "Zappy gun more woodlike",
    "@TheCollector_Menu_Title_DesertVolt": "Make gun sandy",
    "@TheCollector_Recipes_Title_IrrArm": "Make glowy armor",
    "@TheCollector_Recipes_Title_VoltThwack": "Make VOLT shotgun angrier",
    "@TheCollector_Trade_GG_ExpolrationSuit_Name": "Explorer Suit Trade",
    "@TheCollector_Trade_GG_XanthuleSuit_Name": "Xanthule Suit Trade",
    "@TheCollector_Trade_GG_VentureSuilt_Name": "Venture Suit Trade",
    "@TheCollector_Trade_GG_Karna_Name": "Karna Trade",
    "@TheCollector_Trade_GG_S71_Name": "S71 Trade",
    "@TheCollector_Trade_GG_Coda_Name": "Coda Trade",
    "@TheCollector_Recipes_Title_ZipZap": "Snow Snipe",
    "@TheCollector_Recipes_Title_Hush": "Hide Snow Suit",
    "@TheCollector_Recipes_Title_LotsOfZipZap": "Heavy VOLT Zapper",
    "@TheCollector_Recipes_Title_Molten": "Do Lava Suit",
    "@TheCollector_Recipes_Title_HeavyUtil": "Shiny Builder Suit",
    "@TheCollector_Recipes_Title_Bino": "Want Better Eyes?",
    "@TheCollector_Recipes_Title_SlimyLMG": "Yormandi Gun",
    "@TheCollector_Recipes_Title_F55": "F55 Look Better",
    "@TheCollector_Recipes_Title_Battle": "Test Armor",
    "@TheCollector_Recipes_Title_SpikeyArmor": "Armor with Vanduul",
    "@TheCollector_Recipes_Title_BigBooma": "Curious Weapon",
    "@TheCollector_Recipes_Title_NonePistol": "Hot Shot",
    "@TheCollector_Intro_Title": "Wikelo Arrive to System",
    "@TheCollector_Lunch_Title": "Very Hungry",
    "@TheCollector_Conversion_Favors_Title_3": "Trade Worm Parts for Favors?",
    "@TheCollector_Conversion_Favors_Title_1": "Trade Merc Scrip for Favors?",
    "@TheCollector_Conversion_Favors_Title_2": "Trade Council Scrip for Favors?",
    "@TheCollector_Conversion_Favors_Title": "Turn Things to Favor",
    "@TheCollector_Conversion_SpecialFavors_Title": "Want Polaris? Need something special.",
    "@TheCollector_Ships_Fortune_Indus_TItle": "Fortune ship for you",
    "@TheCollector_Ships_Nox_TItle": "Noxy Mod",
    "@TheCollector_Ships_Intrepid_TItle": "Upgrade Intrepid",
    "@TheCollector_Ships_Pulse_TItle": "Pulse Plus",
    "@TheCollector_Ships_Ursa_TItle": "Make a Ursa Mod",
    "@TheCollector_Ships_GuardianQI_TItle": "Guardian take down ship",
    "@TheCollector_Ships_Firebird_TItle": "Firebird Mod",
    "@TheCollector_Ships_Scorpius_TItle": "Build a Mod Scorpius",
    "@TheCollector_Ships_F7_MK2_TItle": "Wikelo Navy F7",
    "@TheCollector_Ships_ZeusES_TItle": "Zeus ES Mod",
    "@TheCollector_Ships_ZeusCL_TItle": "Zeus CL Mod",
    "@TheCollector_Ships_Peregrine_TItle": "Peregrine Speed Mod",
    "@TheCollector_Ships_Spirit_C1_TItle": "Spirit C1 Mod",
    "@TheCollector_Ships_F8C_Milt_TItle": "F8 War Mod",
    "@TheCollector_Ships_F8C_Stealth_TItle": "Sneaky Stabber",
    "@TheCollector_Ships_Starlift_Max_TItle": "Starlancer MAX Mod",
    "@TheCollector_Ships_Constellation_Taurus_TItle": "Want Taurus ship",
    "@TheCollector_Recipes_Title_AtlsPew": "Make ATLS shoot",
    "@TheCollector_Recipes_Title_AtlsJump": "Make jumpy ATLS shoot",
    "@TheCollector_Menu_Title_PolarisShip": "Now make Polaris. Short Time Deal.",
    "@TheCollector_Mod_ATLS_Geo_Grad3_Name": "ATLS Cool Metal Color",
    "@TheCollector_Mod_ATLS_Geo_Grad1_Name": "ATLS Snowland Color",
    "@TheCollector_Mod_ATLS_Geo_Grad2_Name": "ATLS Orange Line",
    "@TheCollector_Ships_Terrapin_Medic_Title": "Terrapin Medic Mod",
    "@TheCollector_Ships_Drake_Golem_Title": "Golem Rocks",
    "@TheCollector_Ships_Starlancer_ATC_Title": "Starlancer TAC Mod",
    "@TheCollector_Ships_Crusader_A2_Title": "Starlifter A2 War Mod",
    "@TheCollector_Ships_Starfighter_Ion_Title": "Ion Stealth Mod",
    "@TheCollector_Ships_Starfighter_Inferno_Title": "Inferno War Mod",
    "@TheCollector_Ships_Prowler_Util_Title": "Prowler Work Mod",
    "@TheCollector_Ships_Guardian_TItle": "Guardian Mod",
    "@TheCollector_Ships_GuardianMX_Title": "Guardian WiK-X",
    "@TheCollector_Ships_Meteor_Title": "Meteor Mod",
    "@TheCollector_Ships_MISC_Prospector_Title": "Prospector Work Mod",
    "@TheCollector_Ships_ARGO_Raft_Title": "Ready for RAFT?",
    "@TheCollector_Ships_Anvil_Asgard_Title": "Asgard Fight Mod",
    "@TheCollector_Ships_Kruger_Wolf_Title": "Wolf Mod",
    "@TheCollector_Ships_Wolf_Unique_Title": "Wolf Special Mod",
    "@TheCollector_Ships_Idris_Title": "Idris Mod",
}


def extract_requirements_from_template(template_path):
    """Extract item requirements from a contract template file."""
    with open(template_path) as f:
        data = json.load(f)

    requirements = []
    val = data["_RecordValue_"]

    for token in val.get("objectiveTokens", []):
        handler = token.get("objectiveHandler", {})
        for order in handler.get("haulingOrders", []):
            if order["_Type_"] == "HaulingOrder_EntityClass":
                entity_path = order.get("entityClass", "")
                entity_id = entity_path.split("/")[-1].replace(".json", "") if entity_path else "unknown"
                min_amt = order.get("minAmount", 0)
                max_amt = order.get("maxAmount", 0)

                display_name = ITEM_NAMES.get(entity_id, entity_id)
                quantity = max(min_amt, max_amt) if max_amt > 0 else min_amt

                if quantity > 0:
                    requirements.append({
                        "item": display_name,
                        "item_id": entity_id,
                        "quantity": quantity,
                    })

    return requirements


def extract_all_contracts(datacore_path):
    """Extract all Collector contracts with their requirements."""
    templates_dir = os.path.join(
        datacore_path,
        "DataCore/libs/foundry/records/contracts/contracttemplates"
    )
    generator_path = os.path.join(
        datacore_path,
        "DataCore/libs/foundry/records/contracts/contractgenerator/thecollector.json"
    )

    # Load template requirements
    template_requirements = {}
    for f in glob.glob(os.path.join(templates_dir, "thecollector_*.json")):
        basename = os.path.basename(f).replace(".json", "")
        reqs = extract_requirements_from_template(f)
        if reqs:
            template_requirements[basename] = reqs

    # Also check the itemresourcegathering templates
    for f in glob.glob(os.path.join(templates_dir, "itemresourcegathering_recipe_thecollector_*.json")):
        basename = os.path.basename(f).replace(".json", "")
        reqs = extract_requirements_from_template(f)
        if reqs:
            template_requirements[basename] = reqs

    # Load the generator to get contract -> template mapping
    with open(generator_path) as f:
        gen_data = json.load(f)

    results = []
    for gen in gen_data["_RecordValue_"]["generators"]:
        generator_name = gen.get("debugName", "unknown")

        for contract in gen.get("contracts", []):
            debug_name = contract.get("debugName", "unknown")
            template_ref = contract.get("template", "")
            template_name = template_ref.split("/")[-1].replace(".json", "") if "/" in template_ref else ""

            # Get title from param overrides
            title_key = ""
            overrides = contract.get("paramOverrides", {})
            for sp in overrides.get("stringParamOverrides", []):
                if sp.get("param") == "Title":
                    title_key = sp.get("value", "")

            title = TITLE_MAP.get(title_key, title_key)

            # Get requirements from template
            requirements = template_requirements.get(template_name, [])

            # Check for hauling order overrides in the contract itself
            for po in overrides.get("propertyOverrides", []):
                if po.get("missionVariableName") == "HaulingOverride":
                    hauling_content = po.get("value", {}).get("haulingOrderContent", [])
                    if hauling_content:
                        # Override requirements from the contract level
                        override_reqs = []
                        for order in hauling_content:
                            if order.get("_Type_") == "HaulingOrderContent_Item":
                                entity_path = order.get("entityClass", "")
                                entity_id = entity_path.split("/")[-1].replace(".json", "") if isinstance(entity_path, str) and "/" in entity_path else ""
                                min_amt = order.get("minAmount", 0)
                                max_amt = order.get("maxAmount", 0)
                                if entity_id:
                                    display_name = ITEM_NAMES.get(entity_id, entity_id)
                                    quantity = max(min_amt, max_amt) if max_amt > 0 else min_amt
                                    if quantity > 0:
                                        override_reqs.append({
                                            "item": display_name,
                                            "item_id": entity_id,
                                            "quantity": quantity,
                                        })
                        if override_reqs:
                            requirements = override_reqs

            # Check if DO_NOT_USE
            is_disabled = "DO_NOT_USE" in debug_name

            results.append({
                "debug_name": debug_name,
                "generator": generator_name,
                "template": template_name,
                "title_key": title_key,
                "title": title,
                "requirements": requirements,
                "disabled": is_disabled,
            })

    return results


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <game_data_path> [--output file.json]")
        sys.exit(1)

    datacore_path = sys.argv[1]
    output_path = "contract_requirements.json"

    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    contracts = extract_all_contracts(datacore_path)

    # Print summary
    with_reqs = [c for c in contracts if c["requirements"]]
    disabled = [c for c in contracts if c["disabled"]]
    active_with_reqs = [c for c in with_reqs if not c["disabled"]]

    print(f"Total contracts: {len(contracts)}")
    print(f"  With requirements: {len(with_reqs)}")
    print(f"  Disabled (DO_NOT_USE): {len(disabled)}")
    print(f"  Active with requirements: {len(active_with_reqs)}")

    print(f"\nActive contracts with requirements:")
    for c in active_with_reqs:
        print(f"  {c['title']}")
        for r in c["requirements"]:
            print(f"    {r['quantity']}x {r['item']}")

    # Write output
    with open(output_path, "w") as f:
        json.dump(contracts, f, indent=2)

    print(f"\nWritten to {output_path}")


if __name__ == "__main__":
    main()
