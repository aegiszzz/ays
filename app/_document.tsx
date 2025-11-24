import { Children } from 'react';
import { AppRegistry } from 'react-native';

export default function Document() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        <meta name="application-name" content="Social Media PWA" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SocialPWA" />
        <meta name="mobile-web-app-capable" content="yes" />

        <meta name="description" content="A decentralized social media platform with crypto wallet integration" />
        <meta name="theme-color" content="#000000" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/assets/images/favicon.png" />
        <link rel="apple-touch-icon" href="/assets/images/icon.png" />
      </head>
      <body>
        <div id="root" />
      </body>
    </html>
  );
}
