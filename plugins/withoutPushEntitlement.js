// MedSync only uses local (on-device) reminders, so it doesn't need Apple's push
// entitlement. Removing it lets the app be signed with a free Apple ID (AltStore / SideStore).
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
