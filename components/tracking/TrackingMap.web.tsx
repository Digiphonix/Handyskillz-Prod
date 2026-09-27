import React, { useEffect, useRef } from 'react';
import { mapDocument, type TrackingMapProps } from './mapDocument';

export default function TrackingMap({ point }: TrackingMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(point);
  latest.current = point;
  const update = () => frame.current?.contentWindow?.postMessage({ type: 'handyskillz-location', point: latest.current }, '*');
  useEffect(() => { update(); }, [point]);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'handyskillz-map-ready') update();
    };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, []);
  return <iframe ref={frame} title="Provider live location map" srcDoc={mapDocument}
    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
    onLoad={update} style={{ width: '100%', height: '100%', border: 0 }} />;
}
