-- Migration 0006: Avatar system
-- Adds gravatar opt-out preference to user table.
ALTER TABLE "user" ADD COLUMN gravatar_opted_out INTEGER NOT NULL DEFAULT 0;
