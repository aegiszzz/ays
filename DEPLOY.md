# PWA Deployment Guide

Bu projeyi public PWA olarak yayınlamak için:

## Adım 1: Build Al
```bash
npm run build:web
```
Bu `dist/` klasörü oluşturur.

## Adım 2: Deploy Et (3 Seçenek)

### A) Vercel (Tavsiye)
1. https://vercel.com gir
2. GitHub'a push et veya direkt drag & drop
3. Otomatik deploy olur
4. Link hazır!

### B) Netlify
1. https://netlify.com gir
2. Drag & drop ile `dist/` klasörünü yükle
3. Link hazır!

### C) GitHub Pages
1. Projeyi GitHub'a push et
2. Settings → Pages → dist klasörünü seç
3. Link: `https://username.github.io/repo`

## Build Tamamlandı mı Kontrol Et
```bash
ls -la dist/
```

Eğer sadece manifest.json ve service-worker.js varsa, build henüz tamamlanmamıştır.
Tam build'de şunlar olmalı:
- _expo/
- assets/
- index.html
- manifest.json
- service-worker.js
