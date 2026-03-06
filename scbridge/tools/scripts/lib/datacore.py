"""Shared utilities for DataCore extraction scripts."""

import re

CLASS_PATTERN = re.compile(r'Class:\s*(\w+)', re.IGNORECASE)

VALID_CLASSES = frozenset({'Civilian', 'Military', 'Industrial', 'Stealth', 'Competition'})


def extract_class_from_description(desc: str | None) -> str | None:
    """Extract component class from a DataCore localization description.

    Component descriptions contain a structured header like:
        Item Type: Cooler
        Manufacturer: ACOM
        Size: 1
        Grade: C
        Class: Competition

        Descriptive text follows...

    Returns the class string if found and valid, None otherwise.
    """
    if not desc:
        return None
    m = CLASS_PATTERN.search(desc)
    if not m:
        return None
    cls = m.group(1).capitalize()
    return cls if cls in VALID_CLASSES else None
