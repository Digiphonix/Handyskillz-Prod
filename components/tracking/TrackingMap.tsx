import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapDocument, type TrackingMapProps } from './mapDocument';

const source = { html: mapDocument };
export default function TrackingMap({ point }: TrackingMapProps) {
  const map = useRef<WebView>(null);
  const update = () => map.current?.injectJavaScript(`window.updatePoint && window.updatePoint(${JSON.stringify(point)});true;`);
  useEffect(() => { update(); }, [point]);
  return <WebView ref={map} source={source} originWhitelist={['*']} onMessage={update}
    onLoadEnd={update} style={{ flex: 1 }} javaScriptEnabled
    onShouldStartLoadWithRequest={(request) => {
      if (request.url === 'about:blank') return true;
      if (request.url === 'https://www.openstreetmap.org/copyright') void Linking.openURL(request.url);
      return false;
    }} />;
}
