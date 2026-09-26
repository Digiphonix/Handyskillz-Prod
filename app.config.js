const appJson = require('./app.json');

module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  return {
    ...appJson.expo,
    ...config,
    extra: {
      ...appJson.expo.extra,
      ...config.extra,
      ...(projectId ? { eas: { ...(config.extra?.eas || {}), projectId } } : {}),
    },
  };
};
