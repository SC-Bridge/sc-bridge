-- Localization Builder: "Contract Reputation" enhancement toggle.
-- Adds the reputation award amount to ALL rep-awarding contracts (title +
-- description), independent of the Blueprint Pools enhancement.
ALTER TABLE user_localization_configs ADD COLUMN enhance_contract_rep INTEGER NOT NULL DEFAULT 0;
