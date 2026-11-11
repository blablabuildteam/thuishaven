-- Appic Wingame barcode pool: persisted from Weeztix ticket types like the
-- Appic, RA and vrienden pools, so its issued barcodes stop counting as shop sales.
ALTER TYPE ticket_platform ADD VALUE IF NOT EXISTS 'wingame';
