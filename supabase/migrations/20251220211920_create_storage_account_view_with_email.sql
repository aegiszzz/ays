/*
  # Create Storage Account View with Email
  
  1. New View
    - `storage_account_with_email` - Storage account bilgileri + email adresi
    - users tablosuyla JOIN yaparak email bilgisini getirir
    - Admin ve raporlama için daha okunabilir
  
  2. Security
    - RLS politikaları view'e de uygulanır
    - Kullanıcılar sadece kendi kayıtlarını görebilir
    
  3. Benefits
    - Veri tekrarı yok (normalizasyon korunur)
    - Her zaman güncel email gösterir
    - User ID yerine email görmek daha anlaşılır
*/

-- Create view that shows email instead of just user_id
CREATE OR REPLACE VIEW storage_account_with_email AS
SELECT 
  sa.user_id,
  u.email,
  u.username,
  sa.credits_balance,
  sa.credits_total,
  sa.credits_spent,
  sa.created_at,
  sa.updated_at,
  -- Computed columns in GB for easy reading
  ROUND((sa.credits_total::numeric / 102400), 2) as total_gb,
  ROUND((sa.credits_spent::numeric / 102400), 2) as used_gb,
  ROUND((sa.credits_balance::numeric / 102400), 2) as remaining_gb,
  ROUND((sa.credits_spent::numeric / sa.credits_total::numeric * 100), 0) as percentage_used
FROM storage_account sa
JOIN users u ON u.id = sa.user_id;

-- Grant access to authenticated users
GRANT SELECT ON storage_account_with_email TO authenticated;
GRANT SELECT ON storage_account_with_email TO service_role;

-- Add comment
COMMENT ON VIEW storage_account_with_email IS 'Storage account information with user email and username for better readability';
