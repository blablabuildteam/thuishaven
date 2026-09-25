-- Add 'google' to marketing_ad_platform enum for Google Ads Search/PMax/Display campaigns
ALTER TYPE marketing_ad_platform ADD VALUE IF NOT EXISTS 'google';
