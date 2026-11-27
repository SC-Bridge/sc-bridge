-- The real-world scale of a ship's side render, for the Ship DB size lineup.
-- metres_per_pixel: metres per pixel of the published large view (2048.webp).
-- span_m: the ship's drawn length in metres (its left-to-right extent).
-- Set by the render publisher (tools renders/publish.py) for kind 'vehicle', view 'side' only;
-- NULL everywhere else. vehicles.length is not used for this: it is wrong for about a fifth of ships.
ALTER TABLE item_renders ADD COLUMN metres_per_pixel REAL;
ALTER TABLE item_renders ADD COLUMN span_m REAL;
