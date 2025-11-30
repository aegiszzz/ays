# Admin Panel Kurulum

Admin paneli başarıyla oluşturuldu! Şimdi kendini admin yapmak için:

## 1. Admin Olarak Ayarla

Supabase Dashboard > SQL Editor'da şu komutu çalıştır:

```sql
-- Email adresini kendi email'inle değiştir
UPDATE users
SET is_admin = true, admin_email = 'seninemalin@ornek.com'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'seninemalin@ornek.com'
);
```

## 2. Admin Panel'e Eriş

Admin paneline gitmek için:

**URL:** `https://your-domain.com/admin/login`

Ya da geliştirme ortamında:
- `http://localhost:8081/admin/login`

## 3. Giriş Yap

Normal kullanıcı email ve şifreni kullan. Eğer `is_admin = true` ise dashboard'a yönlendirileceksin.

## Admin Panel Özellikleri

### 📊 Dashboard
- Toplam kullanıcı sayısı
- Toplam post sayısı
- Mesaj ve grup istatistikleri
- Hızlı erişim menüleri

### 👥 User Management (`/admin/users`)
- Tüm kullanıcıları görüntüle
- Kullanıcı ara (email/username)
- Admin yetkisi ver
- Kullanıcı sil

### 📷 Content Moderation (`/admin/content`)
- Tüm postları görüntüle
- Post önizleme
- Post silme
- Public/private durum kontrolü

### 📈 Analytics (`/admin/analytics`)
- Detaylı kullanıcı istatistikleri
- İçerik metrikleri
- Engagement analizi
- Platform genel bakışı

## Güvenlik

- Admin paneli RLS korumalı değil (sadece `is_admin` flag kontrolü)
- Admin yetkisi sadece veritabanından verilebilir
- Kullanıcılar kendi kendine admin olamaz
- Admin logout yapınca tekrar login gerekir

## Test

1. Kendini admin yap (yukarıdaki SQL)
2. `/admin/login` sayfasına git
3. Normal kullanıcı olarak giriş yap
4. Dashboard'da tüm özellikleri test et
