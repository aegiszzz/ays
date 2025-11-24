# Social Media PWA

A decentralized social media platform with integrated crypto wallet functionality, built as a Progressive Web App (PWA).

## Features

- User authentication with Supabase
- Media sharing (photos, videos, text posts)
- Direct messaging and group conversations
- Integrated EVM-compatible crypto wallet
- Follow/unfollow users
- Like and comment on posts
- PWA support for installable web app experience

## Tech Stack

- **Frontend**: React Native with Expo
- **Backend**: Supabase (PostgreSQL + Auth)
- **Blockchain**: ethers.js for EVM wallet support
- **Deployment**: PWA for web distribution

## Why PWA?

This app is distributed as a PWA instead of through app stores due to:
- App Store and Google Play's restrictive policies on crypto wallet functionality
- No approval process required
- Instant updates without store review delays
- Cross-platform compatibility
- Installable on any device with a modern browser

## Getting Started

### Development

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build:web
```

### Deployment

The app can be deployed to any static hosting service:

- Vercel
- Netlify
- GitHub Pages
- Firebase Hosting
- Cloudflare Pages

## PWA Installation

Users can install the app on their devices:

1. **Desktop**: Click the install icon in the browser address bar
2. **Mobile**: Tap "Add to Home Screen" in the browser menu
3. **Install Prompt**: The app will show an install banner when eligible

## Environment Variables

Create a `.env` file with:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Security

- Private keys are encrypted and stored securely in Supabase
- Row Level Security (RLS) policies protect user data
- All wallet operations happen client-side
- No private keys are ever sent to servers

## License

MIT
