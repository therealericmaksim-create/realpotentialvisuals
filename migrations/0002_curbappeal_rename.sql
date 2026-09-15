-- v0.11.0 (2026-09-15): prefix every table specific to the current
-- front-exterior "curb appeal" photo-processing pipeline with
-- curbappeal_, so future exterior_/interior_ order types can have their
-- own parallel tables without colliding on names. Pure RENAME — no data
-- loss, no DROP (SQLite/D1 automatically updates FK REFERENCES clauses
-- in other tables' schema when a referenced table is renamed).
--
-- Deliberately NOT renamed: shared/reference catalog tables any future
-- order type would also draw from (styles, materials, design_elements,
-- climate_zones, zip_climate_zones, feasibility_factors, and the
-- style_* compatibility/requirements tables), and generic property-level
-- tables not specific to this pipeline's output (properties,
-- property_restrictions, property_photos, property_neighborhood_analysis
-- -- the last one is an older, currently-unused table distinct from
-- property_neighborhood_reads, which IS this pipeline's real output).

ALTER TABLE structure_profiles RENAME TO curbappeal_structure_profiles;
ALTER TABLE structure_profile_style_votes RENAME TO curbappeal_structure_profile_style_votes;
ALTER TABLE structure_profile_consensus RENAME TO curbappeal_structure_profile_consensus;
ALTER TABLE structure_profile_design_elements RENAME TO curbappeal_structure_profile_design_elements;
ALTER TABLE profile_style_compatibility RENAME TO curbappeal_profile_style_compatibility;
ALTER TABLE profile_style_candidates RENAME TO curbappeal_profile_style_candidates;
ALTER TABLE profile_cache_refresh_log RENAME TO curbappeal_profile_cache_refresh_log;
ALTER TABLE property_structure_analysis RENAME TO curbappeal_property_structure_analysis;
ALTER TABLE property_neighborhood_reads RENAME TO curbappeal_property_neighborhood_reads;
ALTER TABLE property_regulatory_lookups RENAME TO curbappeal_property_regulatory_lookups;
ALTER TABLE job_style_candidates RENAME TO curbappeal_job_style_candidates;

ALTER TABLE orders RENAME COLUMN photo_key TO curbappeal_photo_key;
