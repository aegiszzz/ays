-- Add rate limit config for email verification to prevent brute force of 6-digit codes
INSERT INTO rate_limit_config (endpoint, max_requests, window_minutes, description)
VALUES ('verify-email-code', 10, 15, 'Email verification code attempts: 10 per 15 minutes')
ON CONFLICT (endpoint) DO NOTHING;
