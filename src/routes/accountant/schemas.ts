import { z } from "zod";
import { CATEGORIES } from "../../lib/accountant/constants";

/** Shared Zod pieces for the accountant route modules (ledger, sorting). */
export const categoryEnum = z.enum(CATEGORIES);
