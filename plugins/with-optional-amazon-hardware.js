const { withAndroidManifest } = require('@expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.microphone',
];

module.exports = function withOptionalAmazonHardware(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    for (const featureName of OPTIONAL_FEATURES) {
      const existing = manifest['uses-feature'].find(
        (feature) => feature.$?.['android:name'] === featureName
      );

      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: {
            'android:name': featureName,
            'android:required': 'false',
          },
        });
      }
    }

    return modConfig;
  });
};
